# Customer Intelligence Platform

A Vite, React, Supabase, and Vercel application for durable customer snapshot analysis, frequency planning, campaign targeting, and campaign measurement.

Supabase is the source of truth. Uploaded customer records, historical snapshots, goals, campaigns, frozen campaign targets, campaign results, import history, export history, and audit logs are stored in Postgres. Browser storage is not used for customer data.

## Requirements

- Node.js 22 or newer
- A Supabase project
- A Vercel account
- A GitHub repository

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and set:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

3. Apply `supabase/migrations/202606200001_customer_intelligence_platform.sql` with the Supabase SQL Editor, or link the Supabase CLI and run:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

4. In Supabase Authentication, enable Email authentication. Create the first admin through the app. Email confirmation may be left enabled for production.

5. Start the app:

   ```bash
   npm run dev
   ```

## User approval and super admin

Apply `supabase/migrations/202606210001_user_access_approval.sql` after the base migration. It adds a protected profile table, account approval workflow, approval-aware RLS policies, and super-admin management functions.

- If Auth users already exist, the oldest account becomes the approved super admin.
- If no Auth users exist, the first account created after the migration becomes the approved super admin.
- Every later account starts as `pending` and cannot load or modify platform data.
- The shield button in the lower-right corner opens the super-admin panel for approving, rejecting, or elevating accounts.
- A super admin cannot remove their own access or super-admin role.

Roles and approval status live in the database and cannot be changed through editable user metadata or browser state.

## Database security

The migration enables Row Level Security on every application table. Anonymous users have no table access. Signed-in users can only read and write rows where `owner_id` matches their Supabase user id. Imports, campaign creation, campaign measurement, and permanent deletion run in database transactions.

Never expose a Supabase secret/service-role key through a `VITE_` variable. The browser receives only the publishable/anon key, which is protected by authentication and RLS.

## Move the existing local data

Keep the legacy JSON file outside Git. After the migration is applied and an admin account exists, run:

```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_ANON_KEY="your-publishable-or-anon-key" \
SUPABASE_EMAIL="admin@example.com" \
SUPABASE_PASSWORD="your-password" \
LEGACY_STORE_PATH="./data/customer-intelligence.sqlite" \
npm run migrate:legacy
```

The script imports each saved snapshot through the same transactional database function used by the app, then migrates goals and frozen campaigns. It accepts the legacy SQLite database or JSON store. Re-running it is safe for snapshots with the same ids. Validate the source without connecting first:

```bash
MIGRATION_DRY_RUN=1 npm run migrate:legacy
```

## GitHub

The `.gitignore` excludes dependencies, builds, all environment files except `.env.example`, local SQLite/JSON data, temporary uploads, caches, and logs.

```bash
git init
git add .
git commit -m "Move customer intelligence platform to Supabase"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Review `git status` before every push. Never commit `.env.local`, `data/`, database files, exported backups, or service-role credentials.

## Vercel deployment

1. Import the GitHub repository in Vercel.
2. Keep the framework preset as Vite. `vercel.json` sets the build and SPA rewrite.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production, Preview, and Development.
4. Deploy, sign in, and confirm the latest Supabase dataset loads before uploading anything new.

CLI deployment is also supported:

```bash
npx vercel
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_ANON_KEY
npx vercel --prod
```

## Backup and recovery

Use **Exports > Download Full Backup** to download all datasets, customers, customer records, campaigns, campaign targets, campaign results, goals, imports, audit logs, and export history as JSON.

Store backups in an encrypted location. To restore a backup, use a server-side Supabase service-role key locally:

```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="server-only-secret-key" \
BACKUP_FILE="./customer-intelligence-backup-2026-06-20.json" \
npm run restore:backup
```

The restore script upserts in foreign-key order and does not delete newer rows. Rotate the service-role key if it is ever exposed. Supabase also provides managed database backups; configure the retention or point-in-time recovery level appropriate for the business.

## Production checks

```bash
npm run build
npm run preview
```

After deployment, verify sign-in, initial cloud load, CSV/XLSX import, browser refresh, historical snapshot selection, protected deletion, campaign creation, campaign measurement after a newer snapshot, and full backup export.
