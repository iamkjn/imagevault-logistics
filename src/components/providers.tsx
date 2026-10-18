'use client';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (localStorage.getItem('iv-theme') === 'dark')
      document.documentElement.classList.add('dark');
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return (
    <>
      {children}
      <Toaster richColors position="bottom-right" />
    </>
  );
}
