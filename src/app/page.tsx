import { redirect } from 'next/navigation';

import { hasLiveWorkspaceConfig } from '@/lib/config';

export default function Home() {
  redirect(hasLiveWorkspaceConfig() ? '/dashboard' : '/demo');
}
