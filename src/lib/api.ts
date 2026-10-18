import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import sharp from 'sharp';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { readUploadForm } from './upload-body';
import { validCalendarDate } from './photo-intelligence';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from './db';
import { requireUser, HttpError } from './auth';
import { categories, dateBounds, timezone, imageName, csvCell } from './naming';
import { driveToken, driveFetch, ensureFolders, vaultLock } from './drive';
const categorySchema = z.enum(categories);
const day = z.iso
  .date()
  .refine(validCalendarDate, 'Use a valid date between 1900 and 2199.');
const optionalDay = z.union([day, z.literal('')]).transform((v) => v || null);
const filters = z.object({
  start: day.optional(),
  end: day.optional(),
  category: categorySchema.optional(),
  reference: z.string().max(120).optional(),
  user: z.string().max(100).optional(),
  dateField: z.enum(['uploaded', 'filed']).default('uploaded'),
  sorting: z.enum(['misc', 'sorted']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
const selected = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(30),
  category: categorySchema.optional(),
  targetDate: day.optional(),
  toMisc: z.boolean().default(false),
});
const userSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  status: true,
  createdAt: true,
} as const;
function query(req: NextRequest, user: { id: string; role: string }) {
  const f = filters.parse(
    Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v)),
  );
  if (f.start && f.end && f.start > f.end)
    throw new HttpError(400, 'Start date must precede end date.');
  const where: Prisma.ImageWhereInput = {
    deletedAt: null,
    ...(user.role === 'ADMIN'
      ? f.user
        ? { uploadedById: f.user }
        : {}
      : { uploadedById: user.id }),
    ...(f.category ? { categoryId: f.category } : {}),
    ...(f.reference
      ? {
          OR: [
            { referenceId: { contains: f.reference, mode: 'insensitive' } },
            { orderName: { contains: f.reference, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  if (f.sorting === 'misc') where.filedDate = null;
  if (f.sorting === 'sorted') where.filedDate = { not: null };
  if (f.dateField === 'filed' && (f.start || f.end))
    where.AND = [
      {
        filedDate: {
          ...(f.start ? { gte: f.start } : {}),
          ...(f.end ? { lte: f.end } : {}),
        },
      },
    ];
  if (f.dateField === 'uploaded' && (f.start || f.end))
    where.uploadedAt = dateBounds(
      f.start || '2000-01-01',
      f.end || '2100-01-01',
    );
  return { f, where };
}
async function rateLimit(id: string, limit = 60) {
  const bucket = Math.floor(Date.now() / 60000);
  const r = await db.rateLimit.upsert({
    where: { key: `${id}:${bucket}` },
    create: {
      key: `${id}:${bucket}`,
      count: 1,
      expiresAt: new Date((bucket + 2) * 60000),
    },
    update: { count: { increment: 1 } },
  });
  if (r.count > limit)
    throw new HttpError(429, 'Too many requests. Please retry in a minute.');
  if (Math.random() < 0.01)
    await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
export async function handle(req: NextRequest, path: string[]) {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.get('origin');
      if (
        !origin ||
        origin !== new URL(process.env.NEXTAUTH_URL || req.url).origin
      )
        throw new HttpError(403, 'Invalid request origin.');
    }
    const route = path.join('/');
    const user = await requireUser(
      route.startsWith('admin/') ||
        [
          'stats/daily',
          'stats/summary',
          'folders/tree',
          'activity',
          'export/csv',
          'export/zip',
          'images/bulk',
        ].includes(route),
    );
    if (req.method !== 'GET') await rateLimit(user.id);
    if (route === 'me')
      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
        },
        timezone: timezone(),
      });
    if (route === 'upload' && req.method === 'POST') {
      if (Number(req.headers.get('content-length') || 0) > 3.7 * 1024 * 1024)
        throw new HttpError(
          413,
          'Compress the image to under 3 MB before uploading.',
        );
      const form = await readUploadForm(req);
      const metadata = z
        .object({
          category: categorySchema,
          referenceId: z.string().trim().max(120),
          orderName: z.string().trim().max(120),
          detectedReference: z.string().max(120),
          ocrConfidence: z.coerce.number().min(0).max(100),
          captureDate: optionalDay,
          filedDate: optionalDay,
          capturedAtLocal: z.union([
            z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
            z.literal(''),
          ]),
          captureOffset: z.union([
            z.string().regex(/^(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/),
            z.literal(''),
          ]),
          captureSource: z.enum(['EXIF', 'CAMERA', 'UNKNOWN']),
          notes: z.string().max(2000).default(''),
          uploaderId: z.string().min(1),
          requestId: z.uuid(),
        })
        .parse(
          Object.fromEntries(
            [
              'category',
              'referenceId',
              'notes',
              'uploaderId',
              'requestId',
              'orderName',
              'detectedReference',
              'ocrConfidence',
              'captureDate',
              'filedDate',
              'capturedAtLocal',
              'captureOffset',
              'captureSource',
            ].map((k) => [k, form.get(k)]),
          ),
        );
      if (metadata.uploaderId !== user.id)
        throw new HttpError(
          403,
          'Your signed-in account has changed. Sign in with the account that queued these images.',
        );
      if (
        metadata.capturedAtLocal &&
        metadata.capturedAtLocal.slice(0, 10) !== metadata.captureDate
      )
        throw new HttpError(
          400,
          'Capture metadata date does not match its original time.',
        );
      if (
        metadata.captureSource === 'UNKNOWN' &&
        (metadata.captureDate ||
          metadata.capturedAtLocal ||
          metadata.captureOffset)
      )
        throw new HttpError(
          400,
          'Unknown capture source cannot claim an original date.',
        );
      const filedDate =
        metadata.referenceId || metadata.orderName ? metadata.filedDate : null;
      const file = form.get('file');
      if (
        !(file instanceof File) ||
        file.size > 3 * 1024 * 1024 ||
        file.size === 0
      )
        throw new HttpError(
          400,
          'A compressed image of up to 3 MB is required.',
        );
      const raw = Buffer.from(await file.arrayBuffer());
      const info = await sharp(raw, { limitInputPixels: 40_000_000 })
        .metadata()
        .catch(() => {
          throw new HttpError(400, 'Invalid or unsupported image.');
        });
      if (!['jpeg', 'png', 'webp'].includes(info.format || ''))
        throw new HttpError(
          400,
          'Please convert HEIC to JPEG before uploading.',
        );
      const bytes = await sharp(raw, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      const token = await driveToken();
      const payloadHash = createHash('sha256')
        .update(bytes)
        .update(JSON.stringify(metadata))
        .digest('hex');
      // Reserve a stable Drive ID before upload. Retrying the same queue item cannot duplicate it.
      const prior = await db.uploadRequest.findUnique({
        where: { id: metadata.requestId },
      });
      if (prior && prior.userId !== user.id)
        throw new HttpError(403, 'Upload request belongs to another user.');
      const reservation =
        prior ||
        (await (async () => {
          const generated = await (
            await driveFetch(
              token,
              '/files/generateIds?count=1&space=drive&type=files',
            )
          ).json();
          return db.uploadRequest.upsert({
            where: { id: metadata.requestId },
            create: {
              id: metadata.requestId,
              userId: user.id,
              payloadHash,
              driveFileId: generated.ids[0],
            },
            update: {},
          });
        })());
      if (reservation.payloadHash !== payloadHash)
        throw new HttpError(
          409,
          'This upload ID was already used with different image data.',
        );
      const now = reservation.createdAt;
      const image = await db.$transaction(
        async (tx) => {
          await vaultLock(tx);
          const request = await tx.uploadRequest.findUniqueOrThrow({
            where: { id: metadata.requestId },
          });
          if (request.userId !== user.id)
            throw new HttpError(403, 'Invalid upload request.');
          if (request.imageId)
            return tx.image.findUniqueOrThrow({
              where: { id: request.imageId },
            });
          await tx.category.upsert({
            where: { id: metadata.category },
            create: { id: metadata.category, name: metadata.category },
            update: {},
          });
          await ensureFolders(tx, token, metadata.category, null);
          const folder = await ensureFolders(
            tx,
            token,
            metadata.category,
            filedDate,
          );
          const name = imageName(
            metadata.category,
            [metadata.orderName, metadata.referenceId]
              .filter(Boolean)
              .join('-') || 'UNSORTED',
            user.name,
            now,
          );
          let exists = false;
          try {
            await driveFetch(token, `/files/${request.driveFileId}?fields=id`);
            exists = true;
          } catch (e) {
            if (!(e instanceof HttpError) || e.status !== 404) throw e;
          }
          if (!exists) {
            const boundary = `iv-${crypto.randomUUID()}`;
            const payload = Buffer.concat([
              Buffer.from(
                `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ id: request.driveFileId, name, parents: [folder.driveFolderId] })}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
              ),
              bytes,
              Buffer.from(`\r\n--${boundary}--`),
            ]);
            await driveFetch(
              token,
              'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
              {
                method: 'POST',
                headers: {
                  'Content-Type': `multipart/related; boundary=${boundary}`,
                },
                body: new Uint8Array(payload),
              },
              true,
            );
          } else {
            await driveFetch(token, `/files/${request.driveFileId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
          }
          const item = await tx.image.create({
            data: {
              driveFileId: request.driveFileId,
              fileName: name,
              categoryId: metadata.category,
              referenceId: metadata.referenceId,
              orderName: metadata.orderName || null,
              detectedReference: metadata.detectedReference || null,
              ocrConfidence: metadata.ocrConfidence,
              captureDate: metadata.captureDate,
              capturedAtLocal: metadata.capturedAtLocal || null,
              captureOffset: metadata.captureOffset || null,
              captureSource: metadata.captureSource,
              filedDate,
              notes: metadata.notes,
              uploadedById: user.id,
              folderId: folder.id,
              mimeType: 'image/jpeg',
              sizeBytes: bytes.length,
              uploadedAt: now,
            },
          });
          await tx.uploadRequest.update({
            where: { id: request.id },
            data: { imageId: item.id },
          });
          await tx.activityLog.create({
            data: {
              userId: user.id,
              action: 'UPLOADED',
              entityId: item.id,
              meta: { fileName: name, referenceId: metadata.referenceId },
            },
          });
          return item;
        },
        { maxWait: 15000, timeout: 60000 },
      );
      return NextResponse.json(image, { status: 201 });
    }
    if (route === 'images' && req.method === 'GET') {
      const { f, where } = query(req, user);
      const [items, total] = await Promise.all([
        db.image.findMany({
          where,
          orderBy: { uploadedAt: 'desc' },
          skip: (f.page - 1) * 24,
          take: 24,
          include: {
            uploadedBy: { select: { id: true, name: true, email: true } },
          },
        }),
        db.image.count({ where }),
      ]);
      return NextResponse.json({
        items,
        total,
        page: f.page,
        pages: Math.ceil(total / 24),
      });
    }
    if (path[0] === 'images' && path[1] && path[1] !== 'bulk') {
      const item = await db.image.findFirst({
        where: {
          id: path[1],
          deletedAt: null,
          ...(user.role === 'ADMIN' ? {} : { uploadedById: user.id }),
        },
      });
      if (!item) throw new HttpError(404, 'Image not found.');
      if (req.method === 'GET' && ['thumbnail', 'download'].includes(path[2])) {
        const token = await driveToken();
        const media = await driveFetch(
          token,
          `/files/${item.driveFileId}?alt=media`,
        );
        if (path[2] === 'thumbnail') {
          const thumb = await sharp(Buffer.from(await media.arrayBuffer()))
            .resize(600, 450, { fit: 'cover' })
            .jpeg({ quality: 75 })
            .toBuffer();
          return new Response(new Uint8Array(thumb), {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'private, no-store',
            },
          });
        }
        return new Response(media.body, {
          headers: {
            'Content-Type': item.mimeType,
            'Content-Disposition': `attachment; filename="${item.fileName}"`,
            'Cache-Control': 'private, no-store',
          },
        });
      }
      if (req.method === 'PATCH') {
        if (user.role !== 'ADMIN')
          throw new HttpError(403, 'Administrator access required.');
        const details = z
          .object({
            referenceId: z.string().trim().max(120),
            orderName: z.string().trim().max(120),
          })
          .parse(await req.json());
        const token = await driveToken();
        const updated = await db.$transaction(
          async (tx) => {
            await vaultLock(tx);
            const fresh = await tx.image.findFirst({
              where: { id: item.id, deletedAt: null },
              include: { uploadedBy: { select: { name: true } } },
            });
            if (!fresh) throw new HttpError(404, 'Image not found.');
            const name = imageName(
              fresh.categoryId,
              [details.orderName, details.referenceId]
                .filter(Boolean)
                .join('-') || 'UNSORTED',
              fresh.uploadedBy.name,
              fresh.uploadedAt,
            );
            await driveFetch(token, `/files/${fresh.driveFileId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            const result = await tx.image.update({
              where: { id: item.id },
              data: { ...details, fileName: name },
            });
            await tx.activityLog.create({
              data: {
                userId: user.id,
                action: 'DETAILS_UPDATED',
                entityId: item.id,
                meta: {
                  before: {
                    referenceId: fresh.referenceId,
                    orderName: fresh.orderName,
                  },
                  after: details,
                },
              },
            });
            return result;
          },
          { maxWait: 15000, timeout: 60000 },
        );
        return NextResponse.json(updated);
      }
      if (req.method === 'DELETE') {
        if (user.role !== 'ADMIN')
          throw new HttpError(403, 'Administrator access required.');
        await mutateImages(user.id, [item.id], 'delete');
        return NextResponse.json({ ok: true });
      }
    }
    if (route === 'images/bulk' && req.method === 'POST') {
      const body = selected
        .extend({ action: z.enum(['delete', 'move']) })
        .parse(await req.json());
      if (body.action === 'move' && !body.category)
        throw new HttpError(400, 'Select a destination category.');
      if (
        body.action === 'move' &&
        !body.toMisc &&
        !body.targetDate &&
        (await db.image.count({
          where: { id: { in: body.ids }, deletedAt: null, filedDate: null },
        }))
      )
        throw new HttpError(
          400,
          'Choose a destination date to sort images from Misc.',
        );
      await mutateImages(
        user.id,
        body.ids,
        body.action,
        body.category,
        body.targetDate,
        body.toMisc,
      );
      return NextResponse.json({ ok: true });
    }
    if (route === 'stats/summary' || route === 'stats/daily') {
      const { f, where } = query(req, user);
      const now = new Date();
      const today = formatInTimeZone(now, timezone(), 'yyyy-MM-dd');
      const week = new Date(`${today}T12:00:00Z`);
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
      const uploadedAt = where.uploadedAt as
        { gte: Date; lt: Date } | undefined;
      const clauses = [Prisma.sql`"deletedAt" IS NULL`];
      if (uploadedAt)
        clauses.push(
          Prisma.sql`"uploadedAt" >= ${uploadedAt.gte} AND "uploadedAt" < ${uploadedAt.lt}`,
        );
      if (where.categoryId)
        clauses.push(Prisma.sql`"categoryId" = ${String(where.categoryId)}`);
      if (where.uploadedById)
        clauses.push(
          Prisma.sql`"uploadedById" = ${String(where.uploadedById)}`,
        );
      if (f.reference) {
        const ref = f.reference;
        clauses.push(
          Prisma.sql`(POSITION(LOWER(${ref}) IN LOWER("referenceId")) > 0 OR POSITION(LOWER(${ref}) IN LOWER(COALESCE("orderName",''))) > 0)`,
        );
      }
      if (f.sorting === 'misc') clauses.push(Prisma.sql`"filedDate" IS NULL`);
      if (f.sorting === 'sorted')
        clauses.push(Prisma.sql`"filedDate" IS NOT NULL`);
      if (f.dateField === 'filed' && f.start)
        clauses.push(Prisma.sql`"filedDate" >= ${f.start}`);
      if (f.dateField === 'filed' && f.end)
        clauses.push(Prisma.sql`"filedDate" <= ${f.end}`);
      const [days, categoryGroups, userGroups] = await Promise.all([
        db.$queryRaw<{ date: string; categoryId: string; count: bigint }[]>(
          Prisma.sql`SELECT to_char("uploadedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone()}, 'YYYY-MM-DD') AS date, "categoryId", COUNT(*) AS count FROM "Image" WHERE ${Prisma.join(clauses, ' AND ')} GROUP BY date,"categoryId" ORDER BY date`,
        ),
        db.image.groupBy({ by: ['categoryId'], where, _count: true }),
        db.image.groupBy({ by: ['uploadedById'], where, _count: true }),
      ]);
      const names = await db.user.findMany({
        where: { id: { in: userGroups.map((g) => g.uploadedById) } },
        select: { id: true, name: true },
      });
      const daily: Record<string, Record<string, number | string>> = {};
      for (const r of days) {
        daily[r.date] ||= {
          date: r.date,
          Parcels: 0,
          Pallets: 0,
          Damaged: 0,
          Other: 0,
          total: 0,
        };
        daily[r.date][r.categoryId] = Number(r.count);
        daily[r.date].total = Number(daily[r.date].total) + Number(r.count);
      }
      const byCategory = categories.map((name) => ({
        name,
        value: categoryGroups.find((g) => g.categoryId === name)?._count || 0,
      }));
      const byUser = userGroups.map((g) => ({
        name: names.find((n) => n.id === g.uploadedById)?.name || 'Unknown',
        count: g._count,
      }));
      const counts = await Promise.all([
        db.image.count({ where: { deletedAt: null } }),
        db.image.count({
          where: { deletedAt: null, uploadedAt: dateBounds(today, today) },
        }),
        db.image.count({
          where: {
            deletedAt: null,
            uploadedAt: dateBounds(week.toISOString().slice(0, 10), today),
          },
        }),
        db.image.count({
          where: {
            deletedAt: null,
            uploadedAt: dateBounds(today.slice(0, 7) + '-01', today),
          },
        }),
        db.user.count({ where: { status: 'ACTIVE' } }),
      ]);
      return NextResponse.json({
        total: counts[0],
        today: counts[1],
        week: counts[2],
        month: counts[3],
        activeUsers: counts[4],
        filteredTotal: categoryGroups.reduce((n, g) => n + g._count, 0),
        daily: Object.values(daily).sort((a, b) =>
          String(a.date).localeCompare(String(b.date)),
        ),
        categories: byCategory,
        users: byUser.sort((a, b) => b.count - a.count),
        timezone: timezone(),
      });
    }
    if (route === 'folders' && req.method === 'POST') {
      if (user.role !== 'ADMIN')
        throw new HttpError(403, 'Administrator access required.');
      const body = z
        .object({ category: categorySchema, date: day })
        .parse(await req.json());
      const token = await driveToken();
      const folder = await db.$transaction(
        async (tx) => {
          await vaultLock(tx);
          await tx.category.upsert({
            where: { id: body.category },
            create: { id: body.category, name: body.category },
            update: {},
          });
          const folder = await ensureFolders(
            tx,
            token,
            body.category,
            body.date,
          );
          await tx.activityLog.create({
            data: {
              userId: user.id,
              action: 'FOLDER_CREATED',
              entityId: folder.id,
              meta: { path: folder.path },
            },
          });
          return folder;
        },
        { maxWait: 15000, timeout: 60000 },
      );
      return NextResponse.json(folder, { status: 201 });
    }
    if (route === 'folders/tree') {
      return NextResponse.json(
        await db.driveFolder.findMany({
          orderBy: { path: 'asc' },
          include: {
            _count: { select: { images: { where: { deletedAt: null } } } },
          },
        }),
      );
    }
    if (route === 'admin/users' && req.method === 'GET')
      return NextResponse.json(
        await db.user.findMany({
          select: {
            ...userSelect,
            _count: { select: { images: { where: { deletedAt: null } } } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      );
    if (route === 'admin/users' && req.method === 'PATCH') {
      const body = z
        .object({
          id: z.string(),
          role: z.enum(['ADMIN', 'USER']).optional(),
          status: z.enum(['ACTIVE', 'PENDING', 'DISABLED']).optional(),
        })
        .refine((b) => b.role || b.status)
        .parse(await req.json());
      const target = await db.user.findUniqueOrThrow({
        where: { id: body.id },
      });
      if (target.id === user.id)
        throw new HttpError(
          400,
          'Another administrator must change your access.',
        );
      const owner = (
        process.env.DRIVE_OWNER_EMAIL ||
        process.env.ADMIN_EMAILS?.split(',')[0] ||
        ''
      )
        .trim()
        .toLowerCase();
      if (
        target.email === owner &&
        (body.role === 'USER' || (body.status && body.status !== 'ACTIVE'))
      )
        throw new HttpError(
          400,
          'The vault owner must remain an active administrator.',
        );
      const updated = await db.$transaction(async (tx) => {
        const result = await tx.user.update({
          where: { id: body.id },
          data: { role: body.role, status: body.status },
          select: userSelect,
        });
        await tx.activityLog.create({
          data: {
            userId: user.id,
            action: 'ACCESS_CHANGED',
            entityId: target.id,
            meta: {
              email: target.email,
              before: { role: target.role, status: target.status },
              after: body,
            },
          },
        });
        return result;
      });
      return NextResponse.json(updated);
    }
    if (route === 'activity') {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .default(1)
        .parse(req.nextUrl.searchParams.get('page') || 1);
      const [items, total] = await Promise.all([
        db.activityLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * 50,
          take: 50,
          include: { user: { select: { name: true, email: true } } },
        }),
        db.activityLog.count(),
      ]);
      return NextResponse.json({
        items,
        total,
        page,
        pages: Math.ceil(total / 50),
      });
    }
    if (route === 'export/csv') {
      const { where } = query(req, user);
      const count = await db.image.count({ where });
      if (count > 10000)
        throw new HttpError(
          400,
          'Narrow the date range to 10,000 images or fewer.',
        );
      const items = await db.image.findMany({
        where,
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { uploadedAt: 'desc' },
      });
      return new Response(
        [
          'Uploaded at,Category,Reference ID,File name,Uploader,Notes,Size bytes,Order name,Original capture date,Original local time,Capture offset,Capture source,Folder date',
          ...items.map((i) =>
            [
              formatInTimeZone(i.uploadedAt, timezone(), 'yyyy-MM-dd HH:mm:ss'),
              i.categoryId,
              i.referenceId,
              i.fileName,
              i.uploadedBy.name,
              i.notes,
              i.sizeBytes,
              i.orderName,
              i.captureDate,
              i.capturedAtLocal,
              i.captureOffset,
              i.captureSource,
              i.filedDate,
            ]
              .map(csvCell)
              .join(','),
          ),
        ].join('\r\n'),
        {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="imagevault-log.csv"',
          },
        },
      );
    }
    if (route === 'export/zip' && req.method === 'POST') {
      const { ids } = selected.parse(await req.json());
      const items = await db.image.findMany({
        where: { id: { in: ids }, deletedAt: null },
      });
      if (items.length !== new Set(ids).size)
        throw new HttpError(
          404,
          'Some selected images are no longer available.',
        );
      if (items.reduce((n, i) => n + i.sizeBytes, 0) > 3 * 1024 * 1024)
        throw new HttpError(
          400,
          'This ZIP exceeds the 3 MB serverless download limit. Select fewer images or download files individually.',
        );
      const token = await driveToken(),
        zip = new JSZip();
      for (const i of items)
        zip.file(
          `${i.id}_${i.fileName}`,
          await (
            await driveFetch(token, `/files/${i.driveFileId}?alt=media`)
          ).arrayBuffer(),
        );
      return new Response(
        new Uint8Array(await zip.generateAsync({ type: 'uint8array' })),
        {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition':
              'attachment; filename="imagevault-images.zip"',
          },
        },
      );
    }
    throw new HttpError(404, 'Endpoint not found.');
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { error: e.issues.map((i) => i.message).join(' ') },
        { status: 400 },
      );
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(
      'ImageVault request failed:',
      e instanceof Error ? e.name : 'UnknownError',
    );
    return NextResponse.json(
      { error: 'The request could not be completed. Please try again.' },
      { status: 500 },
    );
  }
}
async function mutateImages(
  userId: string,
  ids: string[],
  action: 'delete' | 'move',
  category?: (typeof categories)[number],
  targetDate?: string,
  toMisc = false,
) {
  const token = await driveToken();
  for (const id of [...new Set(ids)])
    await db.$transaction(
      async (tx) => {
        await vaultLock(tx);
        const item = await tx.image.findFirst({
          where: { id, deletedAt: null },
          include: { folder: true },
        });
        if (!item) throw new HttpError(404, 'An image is no longer available.');
        if (action === 'delete') {
          await driveFetch(token, `/files/${item.driveFileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true }),
          });
          try {
            await tx.image.update({
              where: { id },
              data: { deletedAt: new Date() },
            });
            await tx.activityLog.create({
              data: {
                userId,
                action: 'DELETED',
                entityId: id,
                meta: { fileName: item.fileName },
              },
            });
          } catch (e) {
            await driveFetch(token, `/files/${item.driveFileId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trashed: false }),
            });
            throw e;
          }
        } else {
          const filedDate = toMisc ? null : targetDate || item.filedDate;
          if (!toMisc && !filedDate)
            throw new HttpError(
              400,
              'Choose a destination date to sort an image from Misc.',
            );
          if (item.categoryId === category && item.filedDate === filedDate)
            return;
          await tx.category.upsert({
            where: { id: category! },
            create: { id: category!, name: category! },
            update: {},
          });
          const folder = await ensureFolders(tx, token, category!, filedDate);
          const name = item.fileName.replace(/^[^_]+/, category!.toUpperCase());
          await driveFetch(
            token,
            `/files/${item.driveFileId}?${new URLSearchParams({ addParents: folder.driveFolderId, removeParents: item.folder.driveFolderId })}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            },
          );
          try {
            await tx.image.update({
              where: { id },
              data: {
                categoryId: category,
                filedDate,
                folderId: folder.id,
                fileName: name,
              },
            });
            await tx.activityLog.create({
              data: {
                userId,
                action: 'MOVED',
                entityId: id,
                meta: { from: item.folder.path, to: folder.path },
              },
            });
          } catch (e) {
            await driveFetch(
              token,
              `/files/${item.driveFileId}?${new URLSearchParams({ addParents: item.folder.driveFolderId, removeParents: folder.driveFolderId })}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.fileName }),
              },
            );
            throw e;
          }
        }
      },
      { maxWait: 15000, timeout: 60000 },
    );
}
