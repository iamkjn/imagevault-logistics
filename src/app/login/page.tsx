import { Login } from '@/components/login';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <Login
      configured={Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.DATABASE_URL,
      )}
    />
  );
}
