# Low-maintenance prototype hosting

This is the recommended route for demonstrations, stakeholder review, and interface testing. It deliberately runs without accounts, a database, or Google Drive so there is almost nothing to operate.

## Deploy

1. Open the [one-click Vercel deployment](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fiamkjn%2Fimagevault-logistics).
2. Sign in to Vercel with GitHub when prompted.
3. Leave **Environment Variables** empty.
4. Accept the framework settings detected by Vercel and click **Deploy**.
5. Open the assigned production URL ending in `.vercel.app`.

When Google OAuth and database values are absent, ImageVault treats `/` as a public prototype entry and redirects it to `/demo`. The protected live workspace routes remain unavailable without sign-in.

## What Vercel handles

- GitHub source import and builds
- An HTTPS `*.vercel.app` address
- New deployments when `main` changes
- Build and runtime logs
- Deployment history and rollback

You do not need to purchase a domain, configure DNS, provision PostgreSQL, register Google OAuth, run database migrations, create storage folders, rotate application secrets, or back up prototype data.

## Prototype limits

- Demo data is bundled sample data and resets on reload.
- Selected images are analyzed locally in the browser and are not uploaded.
- User, folder, upload, and administrator changes are simulations.
- There are no real accounts, shared data, Drive files, database records, or durable exports.
- The public URL can be opened by anyone who receives it.

These limits keep the prototype simple and inexpensive. Move to the live setup only when persistent storage and multiple real users are needed.

## Updating the prototype

After Vercel connects the repository, push an approved change to `main`. Vercel builds it automatically. If a build fails, the previous successful production deployment remains available; inspect the failed deployment's build log in Vercel.

## Moving to the live workspace later

Follow [SETUP.md](SETUP.md) and [DATABASE.md](DATABASE.md). Add the required environment variables to Vercel, register the stable production callback with Google, apply the Prisma migrations, and redeploy. Once the Google client ID, client secret, and database URL are present, the root address routes signed-in use toward the live dashboard.
