import { getServerSession, type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { db } from './db';
import { encrypt } from './crypto';
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope:
            'openid email profile https://www.googleapis.com/auth/drive.file',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (
        !user.email ||
        !(profile as { email_verified?: boolean })?.email_verified
      )
        return false;
      const email = user.email.toLowerCase();
      const existing = await db.user.findUnique({ where: { email } });
      if (existing?.status === 'DISABLED') return false;
      const firstAdmin = process.env.ADMIN_EMAILS?.split(',')[0]
        ?.trim()
        .toLowerCase();
      await db.user.upsert({
        where: { email },
        create: {
          email,
          name: user.name || email,
          image: user.image,
          role: email === firstAdmin ? 'ADMIN' : 'USER',
          status: email === firstAdmin ? 'ACTIVE' : 'PENDING',
          encryptedRefreshToken: account?.refresh_token
            ? encrypt(account.refresh_token)
            : undefined,
        },
        update: {
          name: user.name || email,
          image: user.image,
          ...(account?.refresh_token
            ? { encryptedRefreshToken: encrypt(account.refresh_token) }
            : {}),
        },
      });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const u = await db.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        token.sub = u?.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        const u = await db.user.findUnique({
          where: { id: token.sub },
          select: { id: true, role: true, status: true },
        });
        if (u) Object.assign(session.user, u);
      }
      return session;
    },
  },
};
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser(admin = false) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new HttpError(401, 'Please sign in.');
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.status !== 'ACTIVE')
    throw new HttpError(
      403,
      'Your account is awaiting approval or has been disabled.',
    );
  if (admin && user.role !== 'ADMIN')
    throw new HttpError(403, 'Administrator access required.');
  return user;
}
