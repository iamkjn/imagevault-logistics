'use client';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowRight,
  Box,
  Check,
  ShieldCheck,
  FolderTree,
  ScanLine,
} from 'lucide-react';
import { Button } from './ui/button';
import { useEffect, useState } from 'react';
export function Login({ configured }: { configured: boolean }) {
  const [error, setError] = useState(false);
  useEffect(
    () => setError(new URLSearchParams(location.search).has('error')),
    [],
  );
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <ScanLine />
          </span>
          ImageVault<span className="brand-label">LOGISTICS</span>
        </div>
        <div>
          <span className="eyebrow">CLARITY AT EVERY HANDOFF</span>
          <h1>
            Your warehouse.
            <br />
            Every detail.
            <br />
            <em>All in focus.</em>
          </h1>
          <p>
            From receiving bay to final dispatch, give every item a reliable
            visual record.
          </p>
          <div className="login-visual">
            <div className="visual-ring" />
            <Box size={104} strokeWidth={1} />
            <span className="visual-tag">
              <Check size={15} /> Captured. Organized. Secure.
            </span>
          </div>
        </div>
        <footer>Built for the people who keep things moving.</footer>
      </section>
      <section className="login-form">
        <div>
          <span className="eyebrow">WELCOME TO IMAGEVAULT</span>
          <h2>
            A clearer view of
            <br />
            your operations.
          </h2>
          <p>Sign in to your team’s secure image workspace.</p>
          {error && (
            <div className="error-box">
              Sign-in could not be completed. Check your account access and try
              again.
            </div>
          )}
          <Button
            className="google-button"
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            disabled={!configured}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.6a4.9 4.9 0 0 1-2.1 3.2v2.6h3.4c2-1.8 3.1-4.4 3.1-7.6Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.8 0 5.2-.9 6.9-2.2l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.7v2.7A10.4 10.4 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.2 14a6.2 6.2 0 0 1 0-4V7.3H2.7a10 10 0 0 0 0 9.4L6.2 14Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.7 9.7 0 0 0 12 2a10.4 10.4 0 0 0-9.3 5.3L6.2 10c.8-2.4 3.1-4.2 5.8-4.2Z"
              />
            </svg>
            Continue with Google
            <ArrowRight size={18} />
          </Button>
          {!configured && (
            <p className="setup-note">
              Live sign-in is ready for configuration. Add your Google OAuth and
              database environment variables to connect your team.
            </p>
          )}
          <div className="consent">
            <ShieldCheck size={22} />
            <div>
              <strong>Your images stay in your team’s Drive.</strong>
              <p>
                We request access only to files created or opened with
                ImageVault. The designated admin connects the shared vault.
                Staff access is approved by an administrator.
              </p>
            </div>
          </div>
          <Link className="demo-link" href="/demo">
            Explore the interactive demo <ArrowRight size={16} />
          </Link>
          <div className="login-benefits">
            <span>
              <FolderTree size={16} /> Automatically organized
            </span>
            <span>
              <ShieldCheck size={16} /> Access controlled
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
