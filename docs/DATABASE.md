# Database creation and management

ImageVault stores accounts, permissions, image metadata, Drive IDs, upload retry records, and activity logs in PostgreSQL. The image bytes stay in Google Drive. Losing the database therefore loses the app's folder/file mapping even if the Drive files still exist; losing Drive loses the image bytes even if database rows remain. Back up both systems.

## Option A: create a hosted Supabase database

1. Create a project in [Supabase](https://supabase.com/dashboard). Choose the region nearest the application and save the generated database password in a password manager.
2. Open the project, select **Connect**, and choose the Prisma connection instructions.
3. Copy two URLs:
   - **Transaction pooler** for `DATABASE_URL`. It normally uses port `6543` and is suitable for serverless application requests.
   - **Direct connection** for `DIRECT_URL`. If direct IPv6 is unavailable, use the **session pooler**, normally on port `5432`. Prisma uses this URL for migrations.
4. Add `pgbouncer=true`, a low `connection_limit`, and `schema=public` to the runtime URL when the supplied Prisma example does not already include them:

   ```dotenv
   DATABASE_URL="postgresql://USER:ENCODED_PASSWORD@POOLER_HOST:6543/postgres?pgbouncer=true&connection_limit=1&schema=public"
   DIRECT_URL="postgresql://USER:ENCODED_PASSWORD@DIRECT_OR_SESSION_HOST:5432/postgres?schema=public"
   ```

5. URL-encode reserved password characters. For example, `@` becomes `%40`, `#` becomes `%23`, `/` becomes `%2F`, and `:` becomes `%3A`. Copying the Prisma URL supplied by Supabase avoids most formatting mistakes.
6. Keep these URLs only in `.env` locally and encrypted environment settings on the deployment host. Do not put them in GitHub.

This application connects directly from its trusted backend through Prisma. It does not use the Supabase browser client, Supabase Auth, the anonymous key, or public table policies.

## Option B: create PostgreSQL locally with Docker

This option keeps all database data on the development computer. Install Docker Desktop, then create PostgreSQL 16 with a persistent named volume:

```sh
docker run --name imagevault-postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=imagevault \
  -e POSTGRES_PASSWORD=choose-a-long-local-password \
  -e POSTGRES_DB=imagevault \
  -p 127.0.0.1:5432:5432 \
  -v imagevault-postgres-data:/var/lib/postgresql/data \
  -d postgres:16
```

Use a URL-safe password in this example, then put these values in `.env`:

```dotenv
DATABASE_URL="postgresql://imagevault:choose-a-long-local-password@localhost:5432/imagevault?schema=public"
DIRECT_URL="postgresql://imagevault:choose-a-long-local-password@localhost:5432/imagevault?schema=public"
```

Manage the container with:

```sh
docker stop imagevault-postgres
docker start imagevault-postgres
docker logs imagevault-postgres
```

The named volume survives container stop/removal. Do not delete `imagevault-postgres-data` unless its data is no longer needed or a tested backup exists.

## Create the tables

From the project directory, generate the Prisma client and apply every committed migration:

```sh
npm ci
npm run db:generate
npm run db:migrate
```

`npm run db:migrate` runs `prisma migrate deploy`. It applies pending files from `prisma/migrations` in order and records them in PostgreSQL's `_prisma_migrations` table. It does not delete or recreate a current database.

Start the application only after migration succeeds:

```sh
npm run dev
```

No seed command is required. The first configured administrator is created on first Google sign-in, and categories/folder records are created as the app uses them.

## Confirm the database is ready

Check migration state without changing data:

```sh
npx prisma migrate status
```

Open Prisma's local database editor:

```sh
npx prisma studio
```

Prisma Studio normally opens `http://localhost:5555`. Treat it as an administrator tool: it can change production data directly and should never be exposed publicly. Prefer ImageVault's **Team members** screen for approving, disabling, or promoting users because the app also validates protected accounts and writes activity records.

The expected application tables are:

| Table                | Stored data                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| `User`               | Email, role, approval status, profile data, and encrypted Google refresh token          |
| `Category`           | Managed upload categories                                                               |
| `DriveFolder`        | Google Drive folder IDs and their ImageVault paths/dates                                |
| `Image`              | File metadata, Drive file ID, detected order fields, capture date, folder, and uploader |
| `ActivityLog`        | Administrative and upload audit events                                                  |
| `UploadRequest`      | Idempotency records used to make upload retries safe                                    |
| `RateLimit`          | Short-lived request counters                                                            |
| `_prisma_migrations` | Prisma's record of applied schema migrations                                            |

The committed migration enables PostgreSQL row-level security on the application tables without adding browser-facing policies. The trusted migration/table-owner role used by Prisma can access them. Do not add anonymous read/write policies, expose the database password to client code, or prefix it with `NEXT_PUBLIC_`.

## Day-to-day account management

1. Put the vault owner's email first in `ADMIN_EMAILS` and use the same value for `DRIVE_OWNER_EMAIL` before the first login.
2. That first matching account is created as `ADMIN` and `ACTIVE` on sign-in.
3. Other users are created as `USER` and `PENDING`.
4. An administrator approves them from **Team members** in ImageVault.
5. Disable an account from the same screen to block its next API request.

Changing `ADMIN_EMAILS` later does not rewrite existing database rows. If the wrong user was bootstrapped, correct the role/status carefully through a trusted database session, then restart/sign out as needed. Never disable or demote the configured Drive owner while it owns the vault.

## Schema changes

Change `prisma/schema.prisma` only on a development branch and development database. Generate a named migration with:

```sh
npm run db:dev -- --name describe_the_change
```

Review the generated SQL, run the tests, and commit both the schema and migration directory. Apply committed migrations to staging/production with:

```sh
npm run db:migrate
```

Do not use `prisma db push` as the production migration process because it does not provide the same reviewed, versioned migration history. Back up the target database immediately before a production schema change.

## Back up and restore a local database

Create a compressed logical backup from the Docker database:

```sh
docker exec imagevault-postgres pg_dump \
  -U imagevault -d imagevault -Fc \
  -f /tmp/imagevault.dump
docker cp imagevault-postgres:/tmp/imagevault.dump ./imagevault.dump
```

Keep the dump outside the public repository. Test it by restoring into a separate empty database:

```sh
docker exec imagevault-postgres createdb -U imagevault imagevault_restore_test
docker cp ./imagevault.dump imagevault-postgres:/tmp/imagevault.dump
docker exec imagevault-postgres pg_restore \
  -U imagevault -d imagevault_restore_test \
  --clean --if-exists /tmp/imagevault.dump
```

For Supabase, configure the backup capability included with the chosen plan and periodically test a restore into a separate project. A PostgreSQL backup contains metadata and encrypted tokens; it does not contain the Google Drive image bytes. Maintain an appropriate Google Drive retention or backup process separately.

## Safe cleanup and retention

- Use ImageVault to remove images so Drive and PostgreSQL are updated together.
- Do not manually delete `DriveFolder`, `Image`, or `UploadRequest` rows during normal operation.
- Do not rename or move managed folders directly in Drive without reconciling the stored IDs and paths.
- `ActivityLog` is the audit trail. Decide a retention period before purging old entries.
- `RateLimit` entries are temporary, but routine manual deletion is unnecessary.
- Before deleting a user, decide how their `Image` and `ActivityLog` foreign-key records will be retained; disabling the user is safer for audit history.

## Common failures

- **`P1001` / cannot reach database:** verify the host and port, start the local container, check provider network rules, and confirm whether the environment supports the direct URL's IPv6 address.
- **Authentication failed:** reset/check the database password and URL-encode special characters.
- **Migration fails through port 6543:** use the direct or session-pooler port in `DIRECT_URL`; do not run migrations through the transaction pooler.
- **Permission denied or row-level security error:** run Prisma through the intended trusted table-owner/backend role. Do not fix this by granting anonymous browser access.
- **`migrate status` reports failed migration:** preserve a backup, inspect the exact migration error and database state, then use Prisma's documented migration-resolution workflow. Do not edit an already-applied migration file.
- **Connection limit errors:** use the transaction pooler for `DATABASE_URL`, keep its `connection_limit` low for serverless instances, and avoid opening Prisma Studio against production during peak use.
