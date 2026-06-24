# Vercel Deployment Setup

This guide covers everything needed to deploy the UIGen project to Vercel with CI/CD via GitHub Actions.

## Prerequisites

- A [Vercel](https://vercel.com) account (sign up with GitHub)
- Push access to the GitHub repository

---

## Step 1: Import the Project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `doohinkus/open-code-in-action` repository
3. Keep the default framework preset (**Next.js**)
4. Click **Deploy** (the first deploy may fail due to SQLite — that's expected and will be fixed below)

---

## Step 2: Collect Vercel IDs

After importing, go to your project on Vercel:

1. **Project Settings** → **General**
2. Copy the **Project ID** (a long alphanumeric string like `prj_xxxxxxxxxxxx`)
3. Copy the **Organization/Team ID** — if it says `team_xxxxxxxx`, use that; for personal accounts, the org ID is your Vercel user ID (find it at **Account Settings** → **ID**)

---

## Step 3: Create a Vercel API Token

1. Go to [Vercel Account Settings → Tokens](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Name it (e.g. `github-actions-deploy`)
4. Scope: **Full** (needed for deployment)
5. Copy the token immediately — it won't be shown again

---

## Step 4: Add GitHub Secrets

Go to your repository on GitHub:

**Settings** → **Secrets and variables** → **Actions**

Add these three **repository secrets**:

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | The API token from Step 3 |
| `VERCEL_ORG_ID` | Your Vercel team/user ID from Step 2 |
| `VERCEL_PROJECT_ID` | Your Vercel project ID from Step 2 |

---

## Step 5: Fix the Database (SQLite → PostgreSQL)

**⚠️ Important:** The project currently uses **SQLite** (local file), which **will not persist data** on Vercel's serverless infrastructure. Auth, user accounts, and projects will reset between requests.

Switch back to **PostgreSQL** for production:

### 5a. Create a free PostgreSQL database

Use [Neon](https://neon.tech) (serverless Postgres, free tier):

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`)

### 5b. Revert Prisma to PostgreSQL

In `prisma/schema.prisma`, change:

```diff
 datasource db {
-  provider = "sqlite"
-  url      = "file:./dev.db"
+  provider = "postgresql"
+  url      = env("DATABASE_URL")
 }
```

### 5c. Add `DATABASE_URL` to Vercel

In your Vercel project:

**Settings** → **Environment Variables**

Add:

| Key | Value | Environment |
|-----|-------|-------------|
| `DATABASE_URL` | Your Neon connection string | Production, Preview, Development |

### 5d. Regenerate Prisma migration

```bash
rm -rf prisma/migrations
npx prisma migrate dev --name init
git add prisma/
git commit -m "chore: switch back to PostgreSQL"
git push
```

### 5e. Add `DATABASE_URL` to GitHub Secrets

Also add `DATABASE_URL` as a GitHub Actions secret (Neon connection string) — the CI workflow uses it for testing.

---

## Step 6: Create GitHub Environments (Optional)

For the deployment workflow to work cleanly, create two environments in your GitHub repo:

**Settings** → **Environments**

Create **`canary`** (no protection rules needed) — this is already referenced in the workflow.

The `production` environment was removed from the workflow due to a linter issue, but you can add it back with approval gates for manual promotion.

---

## Step 7: Push to `main`

Once the secrets are set and the database is configured, pushing to `main` will trigger the CI/CD pipeline:

1. **`test`** job — runs lint + unit tests + build
2. **`deploy-canary`** — deploys to Vercel canary environment
3. **`test-canary`** — runs E2E + a11y tests against the canary URL
4. **`promote-to-prod`** — deploys the canary build to production

---

## Troubleshooting

| Error | Likely cause |
|-------|-------------|
| Build fails with Prisma error | `DATABASE_URL` not set in Vercel project env vars |
| Auth/users not persisting | SQLite is being used instead of PostgreSQL |
| "No projects found" on deploy | Missing `VERCEL_PROJECT_ID` secret |
| E2E tests fail on canary | `VERCEL_ORG_ID` may be wrong — check team vs personal |
