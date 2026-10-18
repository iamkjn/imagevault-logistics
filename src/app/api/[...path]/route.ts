import { NextRequest } from 'next/server';
import { handle } from '@/lib/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return handle(req, (await ctx.params).path);
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
