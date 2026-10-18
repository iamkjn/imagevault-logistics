import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (
    p.startsWith('/ocr/') ||
    p === '/login' ||
    p === '/demo' ||
    p.startsWith('/api/auth') ||
    p === '/manifest.webmanifest' ||
    p === '/icon.svg' ||
    p === '/sw.js'
  )
    return NextResponse.next();
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    if (p.startsWith('/api/'))
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
