# Vercel Deployment Setup

This guide covers deploying the UIGen project to Vercel with CI/CD via GitHub Actions.

The project is already PostgreSQL (Neon) end to end — `prisma/schema.prisma` uses `provider = "postgresql"` with `DATABASE_URL` (pooled, runtime) and `directUrl = DATABASE_URL_UNPOOLED` (migrations), so no datasource changes are needed. **Never `rm -rf prisma/migrations` and re-init**; the four committed migrations are the source of truth.

## Prerequisites

- A [Vercel](https://vercel.com) account (sign up with GitHub)
- Push access to the GitHub repository
- A Neon Postgres database (see README → Database)

---

## Step 1: Import the Project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `doohinkus/open-code-in-action` repository
3. Keep the default framework preset (**Next.js**)

Vercel auto-detects `npm run vercel-build` (`npx prisma generate && next build`) as the build command — nothing to configure.

## Step 2: Set Environment Variables

In your Vercel project: **Settings** → **Environment Variables**. The app fails at runtime without the first four.

| Key | Value | Environments |
|-----|-------|--------------|
| `DATABASE_URL` | Neon pooled connection string | Production, Preview, Development |
| `DATABASE_URL_UNPOOLED` | Neon direct (unpooled) connection string — from the same Neon project | Production, Preview, Development |
| `NEON_AUTH_BASE_URL` | Neon Auth base URL | Production, Preview, Development |
| `NEON_AUTH_COOKIE_SECRET` | Neon Auth cookie secret | Production, Preview, Development |
| `GOOGLE_GENERATIVE_AI_API_KEY` (optional) | Enables a real Gemini provider instead of the mock | all |
| `GROQ_API_KEY` (optional) | Adds Groq as a provider/fallback | all |
| `SENTRY_DSN` (optional) | Enables Sentry error reporting | all |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (optional) | Source-map upload at build time; builds succeed without them (upload is skipped) | Project settings |

---

## Step 3: Collect Vercel IDs and Create a Token

1. **Project Settings** → **General**: copy the **Project ID** (`prj_…`)
2. Copy the **Organization/Team ID** — if it says `team_xxxxxxxx`, use that; for personal accounts, the org ID is your Vercel user ID (**Account Settings** → **ID**)
3. [Vercel Account Settings → Tokens](https://vercel.com/account/tokens) → **Create Token** (e.g. `github-actions-deploy`, scope: **Full**). Copy it immediately — it won't be shown again.

## Step 4: Add GitHub Secrets

Repository: **Settings** → **Secrets and variables** → **Actions**:

| Secret | Value | Required |
|--------|-------|----------|
| `VERCEL_TOKEN` | API token from Step 3 | Only for the (currently disabled) canary pipeline |
| `VERCEL_ORG_ID` | Vercel team/user ID | Only for canary |
| `VERCEL_PROJECT_ID` | Vercel project ID | Only for canary |
| `DATABASE_URL` | Neon connection string | Only for canary (used by the commented-out canary E2E tests) |

Note: the active jobs (PR `lint-test-build`, deploy `test`) need **no** secrets — they run lint/unit tests and build against the mock provider.

---

## Step 5: Push to `main`

The deploy workflow (`.github/workflows/deploy.yml`) currently runs only:

1. **`test`** job — lint + unit tests

A canary→production pipeline (`deploy-canary` → `test-canary` → `promote-to-prod`) is scaffolded in the workflow but **commented out**, including its `environment: canary`. To enable it: uncomment the jobs, make sure the `VERCEL_*` secrets from Step 4 exist, and create the `canary` environment in **Settings** → **Environments** (no protection rules needed).

---

## Troubleshooting

| Error | Likely cause |
|-------|-------------|
| Build fails with Prisma error | `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) not set in the Vercel project |
| Runtime errors on requests / auth broken | `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` missing |
| Deploy succeeds but app errors with missing env | See README Prerequisites — all four required vars above |
| "No projects found" on deploy | Missing `VERCEL_PROJECT_ID` secret |
