import type { VaultImage, VaultUser, Activity } from './client';
const names = ['Alex Morgan', 'Jamie Chen', 'Sam Taylor', 'Jordan Ellis'];
const cats = ['Parcels', 'Pallets', 'Damaged', 'Other'];
let images: VaultImage[] = [];
let users: VaultUser[] = [];
let activities: Activity[] = [];
const extraFolders = new Set<string>(['ImageVault/Misc']);
function seed() {
  if (images.length) return;
  users = names.map((name, i) => ({
    id: `user-${i}`,
    name,
    email: `${name.split(' ')[0].toLowerCase()}@example.com`,
    role: i === 0 ? 'ADMIN' : 'USER',
    status: i === 3 ? 'PENDING' : 'ACTIVE',
    createdAt: new Date().toISOString(),
    _count: { images: 0 },
  }));
  for (let i = 0; i < 168; i++) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.pow(i / 168, 1.6) * 29));
    date.setHours(16 - (i % 8), 47 - (i % 45), 0, 0);
    const categoryId =
      cats[i % 10 < 6 ? 0 : i % 10 < 8 ? 1 : i % 10 === 8 ? 2 : 3];
    const u = users[i % 3];
    images.push({
      id: `sample-${i}`,
      driveFileId: 'demo',
      fileName: `${categoryId.toUpperCase()}_IV-${10482 - i}.jpg`,
      categoryId,
      referenceId: `IV-${10482 - i}`,
      orderName: i % 3 === 0 ? `Dispatch order ${10482 - i}` : null,
      detectedReference: `IV-${10482 - i}`,
      ocrConfidence: 92,
      captureDate: i % 17 === 0 ? null : date.toISOString().slice(0, 10),
      capturedAtLocal: i % 17 === 0 ? null : date.toISOString().slice(0, 19),
      captureSource: i % 17 === 0 ? 'UNKNOWN' : 'EXIF',
      filedDate: i % 17 === 0 ? null : date.toISOString().slice(0, 10),
      notes:
        i % 4 === 0
          ? 'Ready for dispatch. Checked at receiving bay 02.'
          : 'Received and checked by warehouse team.',
      sizeBytes: 148200 + i * 1412,
      uploadedAt: date.toISOString(),
      uploadedBy: { id: u.id, name: u.name, email: u.email },
      sample: i % 6,
    });
  }
  activities = images.slice(0, 35).map((i) => ({
    id: i.id,
    action: 'UPLOADED',
    entityId: i.id,
    createdAt: i.uploadedAt,
    user: i.uploadedBy,
    meta: { fileName: i.fileName, referenceId: i.referenceId },
  }));
}
export async function demoRequest(path: string, init: RequestInit = {}) {
  seed();
  const [route, qs] = path.split('?');
  const q = new URLSearchParams(qs);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
  const filtered = images.filter(
    (i) =>
      (!q.get('category') || i.categoryId === q.get('category')) &&
      (!q.get('reference') ||
        `${i.referenceId} ${i.orderName || ''}`
          .toLowerCase()
          .includes(q.get('reference')!.toLowerCase())) &&
      (!q.get('user') || i.uploadedBy.id === q.get('user')) &&
      (q.get('sorting') !== 'misc' || !i.filedDate) &&
      (q.get('sorting') !== 'sorted' || !!i.filedDate) &&
      (!q.get('start') ||
        (q.get('dateField') === 'filed'
          ? i.filedDate || ''
          : i.uploadedAt.slice(0, 10)) >= q.get('start')!) &&
      (!q.get('end') ||
        (q.get('dateField') === 'filed'
          ? i.filedDate || '9999'
          : i.uploadedAt.slice(0, 10)) <= q.get('end')!),
  );
  if (route === 'me') return { user: users[0], timezone: 'Europe/London' };
  if (route === 'images') {
    const page = Number(q.get('page') || 1);
    return {
      items: filtered.slice((page - 1) * 24, page * 24),
      total: filtered.length,
      page,
      pages: Math.ceil(filtered.length / 24),
    };
  }
  if (route.startsWith('stats/')) {
    const daily: Record<string, Record<string, number | string>> = {};
    for (const i of filtered) {
      const day = i.uploadedAt.slice(0, 10);
      daily[day] ||= {
        date: day,
        total: 0,
        Parcels: 0,
        Pallets: 0,
        Damaged: 0,
        Other: 0,
      };
      daily[day].total = Number(daily[day].total) + 1;
      daily[day][i.categoryId] = Number(daily[day][i.categoryId]) + 1;
    }
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: images.length,
      today: images.filter((i) => i.uploadedAt.startsWith(today)).length,
      week: images.filter(
        (i) => Date.now() - new Date(i.uploadedAt).getTime() < 7 * 86400000,
      ).length,
      month: images.filter((i) => i.uploadedAt.startsWith(today.slice(0, 7)))
        .length,
      activeUsers: users.filter((u) => u.status === 'ACTIVE').length,
      filteredTotal: filtered.length,
      daily: Object.values(daily).sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      ),
      categories: cats.map((name) => ({
        name,
        value: filtered.filter((i) => i.categoryId === name).length,
      })),
      users: users
        .filter((u) => u.status === 'ACTIVE')
        .map((u) => ({
          name: u.name,
          count: filtered.filter((i) => i.uploadedBy.id === u.id).length,
        })),
      timezone: 'Europe/London',
    };
  }
  if (route === 'admin/users') {
    if (init.method === 'PATCH')
      users = users.map((u) => (u.id === body.id ? { ...u, ...body } : u));
    return users.map((u) => ({
      ...u,
      _count: { images: images.filter((i) => i.uploadedBy.id === u.id).length },
    }));
  }
  if (route === 'activity')
    return { items: activities, total: activities.length, page: 1, pages: 1 };
  if (
    route.startsWith('images/') &&
    route !== 'images/bulk' &&
    init.method === 'PATCH'
  ) {
    const id = route.split('/')[1];
    images = images.map((i) =>
      i.id === id
        ? { ...i, referenceId: body.referenceId, orderName: body.orderName }
        : i,
    );
    return images.find((i) => i.id === id);
  }
  if (route === 'folders' && init.method === 'POST') {
    const paths = [
      'ImageVault',
      `ImageVault/${body.category}`,
      `ImageVault/${body.category}/${body.date.slice(0, 4)}`,
      `ImageVault/${body.category}/${body.date.slice(0, 4)}/${body.date}`,
    ];
    paths.forEach((p) => extraFolders.add(p));
    return { path: paths.at(-1) };
  }
  if (route === 'folders/tree') {
    const paths: Record<string, number> = Object.fromEntries(
      [...extraFolders].map((p) => [p, 0]),
    );
    for (const i of images) {
      const d = i.filedDate || '';
      for (const path of !d
        ? ['ImageVault', 'ImageVault/Misc']
        : [
            'ImageVault',
            `ImageVault/${i.categoryId}`,
            `ImageVault/${i.categoryId}/${d.slice(0, 4)}`,
            `ImageVault/${i.categoryId}/${d.slice(0, 4)}/${d}`,
          ])
        paths[path] = (paths[path] || 0) + 1;
    }
    return Object.entries(paths)
      .sort()
      .map(([path, count]) => ({
        id: path,
        driveFolderId: 'demo',
        path,
        date: path.split('/').length === 4 ? path.split('/').at(-1) : null,
        _count: {
          images:
            path.split('/').length === 4 || path === 'ImageVault/Misc'
              ? count
              : 0,
        },
      }));
  }
  if (route === 'images/bulk') {
    const ids = body.ids as string[];
    if (body.action === 'delete')
      images = images.filter((i) => !ids.includes(i.id));
    else {
      if (
        !body.toMisc &&
        !body.targetDate &&
        images.some((i) => ids.includes(i.id) && !i.filedDate)
      )
        throw new Error(
          'Choose a destination date to sort an image from Misc.',
        );
      images = images.map((i) =>
        ids.includes(i.id)
          ? {
              ...i,
              categoryId: body.category,
              filedDate: body.toMisc ? null : body.targetDate || i.filedDate,
            }
          : i,
      );
    }
    activities.unshift({
      id: crypto.randomUUID(),
      action: body.action === 'delete' ? 'DELETED' : 'MOVED',
      entityId: ids.join(', '),
      createdAt: new Date().toISOString(),
      user: users[0],
      meta: { count: ids.length },
    });
    return { ok: true };
  }
  throw new Error(
    'This action needs a connected Google Drive account. Sign in to use the live vault.',
  );
}
