import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Waiting } from '@/components/waiting';
export default async function Page() {
  const s = await getServerSession(authOptions);
  const u = s?.user as { status?: string } | undefined;
  if (!u) redirect('/login');
  if (u.status === 'ACTIVE') redirect('/dashboard');
  return <Waiting disabled={u.status === 'DISABLED'} />;
}
