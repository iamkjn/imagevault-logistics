# Google Cloud, PostgreSQL and deployment setup

## 1. Local environment

Use Node.js 22.17+ and install the locked dependencies:

```sh
npm ci
cp .env.example .env
openssl rand -base64 32
openssl rand -base64 32
```

Put the first generated random value in `NEXTAUTH_SECRET`, and the second in `ENCRYPTION_KEY`. `ENCRYPTION_KEY` must decode to exactly 32 bytes. Never commit `.env`, log tokens, or prefix secrets with `NEXT_PUBLIC_`.

Use one consistent local origin. The development server binds to `127.0.0.1`; `http://localhost:3000` also normally resolves to it. Set `NEXTAUTH_URL` to the exact origin you browse during real sign-in. OAuth redirect URIs must match that origin. The `/demo` route works without any environment values.

No purchased domain is required for local use. Register `http://localhost:3000` and `http://localhost:3000/api/auth/callback/google` on the OAuth client, then keep the app in Testing with the intended accounts listed as test users. For access from other computers or phones, use an HTTPS deployment URL. Vercel assigns a stable `*.vercel.app` production address automatically; use that exact address for `NEXTAUTH_URL`, the JavaScript origin, and the OAuth callback. Raw LAN IP addresses are not suitable for Google web OAuth callbacks, and mobile camera access should use HTTPS.

## 2. Google Cloud project and OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project for ImageVault Logistics.
2. Open **APIs & Services → Library**, search for **Google Drive API**, and enable it.
3. Open **Google Auth Platform** (or the OAuth consent-screen entry under APIs & Services). Set the application name, support email, developer contact, and authorized app domain. For production, provide your organization’s actual homepage, privacy policy, and terms as required by Google.
4. Choose the audience that fits your organization: Internal for an eligible Google Workspace organization, otherwise External. For External testing, add the vault owner and test staff as test users.
5. Configure the requested scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
6. Create an OAuth client with application type **Web application**.
7. Add authorized JavaScript origins for local and production use, e.g. `http://localhost:3000` and `https://your-app.vercel.app`.
8. Add exact authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - If using the numeric local origin: `http://127.0.0.1:3000/api/auth/callback/google`
   - `https://your-app.vercel.app/api/auth/callback/google`
   - Add your final custom-domain callback too, if applicable.
9. Store the client ID and secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
10. Set `ADMIN_EMAILS` to the intended administrator’s verified Google email. Only the first comma-separated address bootstraps an admin. Set `DRIVE_OWNER_EMAIL` to that same address initially.
11. Sign in as that owner first and accept Drive consent. ImageVault stores the refresh token encrypted and creates folders on the first upload.
12. Sign in as a second user and approve the pending account from **Team members**.

External applications in Google’s Testing state can receive refresh tokens that expire after seven days when Drive scopes are requested. Publish/configure the OAuth application appropriately before operational use. If the owner’s refresh token is revoked or expires, have the owner sign out and sign in again to re-consent. Staff will see a clear reconnect error until this is resolved.

Official references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [token expiration conditions](https://developers.google.com/identity/protocols/oauth2/), [Drive folder creation](https://developers.google.com/workspace/drive/api/guides/folder), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [NextAuth Google provider](https://next-auth.js.org/providers/google).

## 3. PostgreSQL / Supabase

For a complete walkthrough covering Supabase, local Docker PostgreSQL, migrations, Prisma Studio, table purposes, account state, backups, restores, cleanup, and troubleshooting, see [DATABASE.md](DATABASE.md).

1. Create a Supabase project or use an existing PostgreSQL server.
2. Obtain the database connection strings through the project’s **Connect** panel. Use a dedicated backend database role following [Supabase’s Prisma guide](https://supabase.com/docs/guides/database/prisma). The runtime role must own these tables or have the deliberate backend RLS-bypass privileges; it is never exposed to the browser.
3. Set `DATABASE_URL` to the transaction-pooler URL for a serverless deployment (commonly port 6543). Preserve the user/host values shown in your dashboard and append Prisma’s `pgbouncer=true` and an appropriate low `connection_limit` such as 1.
4. Set `DIRECT_URL` to the direct connection URL for migrations, or the session pooler URL (commonly port 5432) when your environment cannot access IPv6. Do not use the transaction pooler for migration operations.
5. URL-encode any special characters in the password. Keep TLS enabled according to your provider’s connection instructions.

Example shapes — substitute the exact dashboard values:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@SESSION_POOLER_HOST:5432/postgres?schema=public"
```

The SQL migration enables RLS on all app tables and defines no anonymous policies. Only the trusted table owner/backend can access them. This app does not use Supabase’s browser client, anonymous key, or Supabase Auth; authentication is through NextAuth. Never add public policies to token or audit tables.

Apply all committed migrations, including the smart-filing metadata migration:

```sh
npm run db:generate
npm run db:migrate
npm run dev
```

Categories are created automatically as they are first used; no seed credentials are needed. The migrations include User, Category, DriveFolder, Image, ActivityLog, RateLimit, and UploadRequest tables and all relevant indexes. The smart-filing migration preserves existing records, marks them as legacy uploads, and derives their initial folder date from the existing managed folder path.

For later schema changes in a disposable development database:

```sh
npx prisma migrate dev --name describe_change
```

Review and commit the generated SQL, then use `npm run db:migrate` in production. Do not use `prisma db push` as a production migration strategy. Back up PostgreSQL before schema changes. Supabase database backups protect metadata, not Google Drive image bytes.

## 4. Vercel deployment

1. Push this source to your own Git repository.
2. Import it into Vercel, choose the **Next.js** framework preset, and select a Node.js 22 runtime.
3. Set the install command to `npm ci` and build command to `npm run build`.
4. Add all values from `.env.example` to the appropriate Vercel environment. Set `NEXTAUTH_URL` to the final HTTPS origin without a trailing slash. Do not use preview credentials or your real vault in an untrusted preview deployment.
5. Before routing live traffic, run `npm run db:migrate` from a trusted release shell against the target database. Migrations are intentionally not run automatically by every preview build.
6. Add the final Vercel/custom-domain OAuth callback to Google Cloud.
7. Deploy, sign in as the owner, and complete the live acceptance checklist in TESTING.md before inviting staff.
8. Set up database backups, error monitoring without payload/token logging, and a suitable Google Drive retention process.

The API route uses the Node.js runtime and a 60-second maximum duration. Verify that the chosen plan supports that duration. Each original image is compressed client-side before its multipart request; the transport limit is 3 MB. ZIP export is capped at 3 MB combined source image data to leave room for archive/protocol overhead under Vercel’s documented payload limit. For larger batches, download individual files, use Drive, or implement an asynchronous export service.

Reference: [Vercel function response-size limits](https://vercel.com/docs/errors/function_response_payload_too_large).

## 5. Configuration reference

| Variable               | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google Web OAuth client ID                                        |
| `GOOGLE_CLIENT_SECRET` | Google Web OAuth secret, server-only                              |
| `NEXTAUTH_SECRET`      | Strong random session/signing secret                              |
| `NEXTAUTH_URL`         | Exact canonical HTTPS origin; local HTTP for development          |
| `DATABASE_URL`         | Prisma runtime PostgreSQL connection                              |
| `DIRECT_URL`           | Migration connection, direct or session pooler                    |
| `ADMIN_EMAILS`         | First address bootstraps an active admin on first login           |
| `DRIVE_OWNER_EMAIL`    | Active administrator whose Drive stores the vault                 |
| `TIMEZONE`             | IANA timezone, e.g. `Europe/London`; used for folders and reports |
| `ENCRYPTION_KEY`       | Base64 representation of 32 random bytes for AES-256-GCM          |

Do not change the encryption key without decrypting and re-encrypting existing stored refresh tokens or arranging re-consent. Do not change the Drive owner after files exist without a planned Drive ownership/access migration: changing an email does not move existing folders or grant access to the new owner.

## Troubleshooting

- **Sign-in disabled:** the server cannot see the Google client ID/secret and database URL. Configure them and restart.
- **redirect_uri_mismatch:** ensure origin, port, scheme, hostname, and `/api/auth/callback/google` exactly match Google Cloud.
- **Waiting for approval:** the first admin must activate the account. Refresh after approval.
- **Vault owner must connect:** sign in as `DRIVE_OWNER_EMAIL` and ensure that account is an active admin.
- **Drive access expired:** sign out/in as the owner to re-consent. Confirm the app is not stuck in External Testing for production use.
- **Database permission errors after migration:** verify the trusted runtime role owns the tables or has the intended backend permissions. Do not solve this by exposing data to `anon` or `authenticated` roles.
- **Stale Drive folder IDs:** restore externally removed folders or reconcile their metadata. Avoid modifying managed folders outside the app.
- **Upload stuck after closing the page:** reopen Upload with the same account. IndexedDB is local to the browser and origin.
- **A gallery image goes to Misc:** confirm the original contains EXIF `DateTimeOriginal` metadata, then correct the folder date during review or let an admin move it later. File modification dates are deliberately ignored.
- **Order text is not detected:** use a clear, well-lit label containing an order/reference marker, then correct the suggestion in the review card. OCR runs locally in the browser and can be affected by blur, glare, handwriting and stylized labels.
