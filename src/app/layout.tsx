import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
export const metadata: Metadata = {
  title: 'ImageVault — Logistics, in focus.',
  description:
    'Your warehouse, captured. Secure photo records for every parcel, pallet and delivery.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4f46e5',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
