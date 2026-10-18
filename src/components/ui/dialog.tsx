'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export const Dialog = D.Root;
export const DialogTitle = D.Title;
export const DialogDescription = D.Description;
export function DialogContent({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="dialog-overlay" />
      <D.Content className={`dialog-content ${className}`}>
        {children}
        <D.Close className="dialog-close" aria-label="Close">
          <X size={20} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
