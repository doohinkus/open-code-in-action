# UIGen

AI-powered React component generator with live preview.

## Prerequisites

- Node.js 25+
- npm
- PostgreSQL (local or [Neon](https://neon.tech))

## Setup

1. Copy `.example.env` to `.env` and configure your preferred AI provider. The project runs without any API key — it falls back to a mock provider that returns canned components.

   ```bash
   cp .example.env .env
   ```

2. Install dependencies and initialize the database:

   ```bash
   npm run setup
   ```

3. Apply Prisma migrations:

   ```bash
   npx prisma migrate dev --name init
   ```

> **Don't run `npm audit fix`.** Dependencies are pinned to specific versions that work together. The vulnerability warnings are cosmetic for a local-only project, and `audit fix` can bump packages past compatible versions and break the app.

## Running the Application

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Testing

| Command | What it runs |
|---------|-------------|
| `npm test` | Vitest unit tests (jsdom) |
| `npm run test:e2e` | Playwright e2e + a11y tests (requires dev server running) |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run lint` | ESLint |

### E2E tests (`tests/e2e/`)

| File | Tests |
|------|-------|
| `smoke.spec.ts` | Homepage loads, chat panel present, preview panel loads (3 tests) |
| `a11y.spec.ts` | axe-core accessibility audit of homepage |
| `component-generation.spec.ts` | Send chat message, tab navigation (2 tests) |

Run locally: start `npm run dev` in one terminal, then `npm run test:e2e` in another.

## Database

PostgreSQL via Prisma. Connection string set via `DATABASE_URL` in `.env`.

- **Local**: point to a local PostgreSQL instance
- **CI**: ephemeral Postgres via Docker service in GitHub Actions
- **Production**: [Neon](https://neon.tech) serverless PostgreSQL (free tier)

### Schema

```prisma
model User { ... }
model Project { ... }
```

Migrations are in `prisma/migrations/`. After schema changes:

```bash
npx prisma migrate dev --name <description>
```

## CI/CD Pipeline

Two GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — Pull Request Checks

```
PR opened
  ├── lint + unit tests + build
  └── e2e + a11y (against ephemeral Postgres)
      └── all pass → PR can merge
```

Runs on every PR to `main`. All tests run on the build artifact — no deploy needed.

### `deploy.yml` — Canary → Production

```
Push to main
  ├── lint + unit tests
  ├── Deploy to Vercel (canary environment)
  ├── e2e + a11y against canary URL
  └── Promote to production (requires GitHub approval gate)
```

### Environments

| Environment | Deploy | Approval Gate |
|-------------|--------|---------------|
| `canary` | Auto on merge to `main` | None |
| `production` | Manual promotion from canary | Required (GitHub Environments) |

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Neon production/staging connection string |
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | Vercel team ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

## Usage

1. Sign up or continue as anonymous user
2. Describe the React component you want to create in the chat
3. View generated components in real-time preview
4. Switch to Code view to see and edit the generated files
5. Continue iterating with the AI to refine your components

## Features

- AI-powered component generation (OpenCode Zen, Google Gemini, Anthropic Claude, or mock)
- Live preview with hot reload
- Virtual file system (no files written to disk)
- Syntax highlighting and code editor
- Component persistence for registered users
- Export generated code

## Tech Stack

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma with PostgreSQL
- Vercel AI SDK
- OpenCode Zen / Google Gemini / Anthropic Claude
- Playwright + axe-core (e2e + a11y tests)
- GitHub Actions (CI/CD)
