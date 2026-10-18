'use client';
import { ShieldCheck } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Button } from './ui/button';
export function Waiting({ disabled }: { disabled: boolean }) {
  return (
    <main className="waiting">
      <ShieldCheck size={50} />
      <h1>
        {disabled ? 'Your access has been disabled' : 'You’re on the list.'}
      </h1>
      <p>
        {disabled
          ? 'Contact your warehouse administrator to restore access.'
          : 'Your account is waiting for admin approval. You can start capturing images as soon as your access is approved.'}
      </p>
      <Button onClick={() => location.reload()}>Check approval status</Button>
      <Button
        variant="ghost"
        onClick={() => signOut({ callbackUrl: '/login' })}
      >
        Sign out
      </Button>
    </main>
  );
}
