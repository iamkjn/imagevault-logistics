import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Workspace } from '@/components/workspace';
const views = [
  'dashboard',
  'gallery',
  'folders',
  'users',
  'activity',
  'settings',
  'upload',
  'my-uploads',
];
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { view } = await params;
  const search = await searchParams;
  const initialFilters = Object.fromEntries(
    Object.entries(search).filter(([, v]) => typeof v === 'string'),
  ) as Record<string, string>;
  if (!views.includes(view)) notFound();
  const s = await getServerSession(authOptions);
  if (!s?.user?.email) redirect('/login');
  const u = await db.user.findUnique({
    where: { email: s.user.email.toLowerCase() },
  });
  if (!u || u.status !== 'ACTIVE') redirect('/waiting');
  if (
    u.role !== 'ADMIN' &&
    !['upload', 'my-uploads', 'settings'].includes(view)
  )
    redirect('/upload');
  return (
    <Workspace
      key={view + new URLSearchParams(initialFilters).toString()}
      initialFilters={initialFilters}
      timezone={process.env.TIMEZONE || 'Europe/London'}
      initialView={view}
      user={{
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
      }}
    />
  );
}
