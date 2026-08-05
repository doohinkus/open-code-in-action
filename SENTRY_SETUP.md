# Sentry Setup Steps

Error tracking and tracing for UIGen. The SDK is already installed and wired up —
these steps activate it against your Sentry organization.

## 1. Create a Sentry project

1. Sign up at https://sentry.io (or use an existing org).
2. Create a new project, platform **Next.js**. This produces an org slug, a
   project slug, and a DSN.
3. Optionally configure a **Release** and enable **Performance** (Traces) in
   Project Settings — the app sends both errors and traces.

## 2. Set runtime env vars

Add these to your local `.env` (from `.example.env`) **and** to Vercel:

```
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

- Without `SENTRY_DSN`, the SDK initializes but sends nothing (safe to deploy).
- No restart is needed on Vercel after setting the var — it takes effect on the
  next deployment.

## 3. Set build-time env vars (source maps + releases)

These are only used during `next build` to upload source maps. Add them to CI /
Vercel build environment (and optionally your local shell):

```
SENTRY_ORG=<org-slug>
SENTRY_PROJECT=<project-slug>
SENTRY_AUTH_TOKEN=<token>
```

- Create the token at: https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/
  with scopes `project:releases` and `project:read` (plus `org:read` for release
  association on Vercel).
- Builds succeed without these — source-map upload is simply skipped.

## 4. Verify it works

Start the dev server and confirm errors are captured:

1. `npx next dev --turbopack`
2. In a terminal run a chat request (any origin check is bypassed with a localhost Origin):
   ```bash
   curl -s -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -H "Origin: http://localhost:3000" \
     -d '{"messages":[{"role":"user","content":"Reply with only the word OK"}],"files":{}}'
   ```
3. In the Sentry dashboard, check **Issues** and **Performance** for a
   `chat.generation` transaction with `latency_ms`, token, step, and tool-call
   measurements.

To force a test error, temporarily throw in `/api/chat` `POST` and send a
request, then revert.

## 5. Release tracking (optional)

- On Vercel with `SENTRY_ORG`/`SENTRY_PROJECT` set, releases are created
  automatically from the commit SHA.
- If you also deploy elsewhere, run:
  ```bash
  npx sentry-cli releases new "$(git rev-parse HEAD)"
  npx sentry-cli releases set-commits "$(git rev-parse HEAD)" --auto
  ```

## Notes / gotchas

- **Client SDK**: init lives in `src/instrumentation-client.ts` (not
  `sentry.client.config.ts`, which is deprecated under Turbopack).
- **Server/Edge**: `sentry.server.config.ts` + `sentry.edge.config.ts`,
  registered via `src/instrumentation.ts`.
- **CSP**: `connect-src` in `next.config.ts` allows `https://*.ingest.sentry.io`.
  If you enable Session Replay, add `https://*.sentry.io` (and `blob:` is already
  allowed).
- **Sampling**: `tracesSampleRate: 1` in all three config files. Lower it (e.g.
  `0.1`) in `src/instrumentation-client.ts` if client trace volume is high.
- **Cost control**: the chat route streams for up to 2 minutes; long traces are
  expected. Set `traceSampleRate` on the `chat.generation` span or enable dynamic
  sampling if needed.
