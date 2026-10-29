# OpenTelemetry Setup Steps

Distributed tracing for UIGen — server-side only, exported to **Grafana Tempo**
over OTLP/HTTP. The SDK is already installed and wired up (`@vercel/otel` via
`src/lib/otel.ts`); these steps activate it against your tracing backend.

## 1. Provision a Tempo / OTLP endpoint

Grafana Cloud: **Observability stacks** → pick a stack → **OpenTelemetry** shows
the endpoint and token. Note:

- Endpoint (OTLP/HTTP): e.g. `https://<otlp-host>` (the stack's `/otlp` URL)
- Auth: HTTP header `Authorization: Basic base64(<stackID>:<token>)`

Any OTLP-HTTP-compatible backend works (self-hosted Alloy/Tempo, Axiom, etc.) —
the exporter config is plain env vars.

## 2. Set runtime env vars

Add these to your local `.env` (from `.example.env`) **and** to Vercel:

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://<otlp-host>
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(stackID:token)>
OTEL_SERVICE_NAME=uigen
```

- Without `OTEL_EXPORTER_OTLP_ENDPOINT`, OTel registration is **skipped
  entirely** — local dev, tests, and bare builds are untouched (safe to deploy
  with nothing set).
- `@vercel/otel` also honors the standard `OTEL_*` spec variables
  (`OTEL_TRACES_SAMPLER`, `OTEL_PROPAGATORS`, …) if you need them later.

## 3. What gets traced

Registered in `src/instrumentation.ts` (Node runtime; before Sentry so Sentry
spans nest under the OTel context):

| Span | Source |
|------|--------|
| `GET /api/…`, `POST /api/…` | auto request instrumentation (`@vercel/otel`) |
| Outbound `fetch` (providers, esm.sh, …) | built-in fetch instrumentation |
| `chat.generation` + `ai.*` | AI SDK `experimental_telemetry` on `streamText` (prompts/outputs redacted) |
| `db.health-check`, `db.project.*`, `db.share.*` | manual `withSpan()` wraps in `/api/health`, `/api/chat`, `src/lib/share.ts` |

Manual spans are needed for the database because Prisma over the Neon
serverless driver speaks fetch/websocket and `$use` middleware is unsupported
with driver adapters.

## 4. Verify it works

Against a local collector (no Grafana needed):

1. Run any OTLP-HTTP listener on `:4318` (e.g. Grafana Alloy, or a stub that
   accepts `POST /v1/traces`).
2. `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run dev`
3. Hit the app: load `/api/health`, then send a chat request (see
   `SENTRY_SETUP.md` §4 for a curl).
4. Confirm `POST /v1/traces` payloads arrive, and that server log lines carry
   `"trace_id"` matching the exported trace (`chat.request.start` etc.).

In Grafana: **Explore → Tempo → Search**, service name `uigen`; open a
`POST /api/chat` trace and drill into `chat.generation` → `ai.*` children.

## Notes / gotchas

- **Server-side only.** No browser SDK; CSP is untouched. The client logger
  never sees trace fields (the correlation source is only registered on the
  server).
- **Edge runtime / middleware** does not register the Node SDK — Sentry edge
  config still covers errors there.
- **Sentry coexistence**: both report tracing. If spans look duplicated in
  dashboards, trim Sentry's `tracesSampleRate` rather than removing OTel.
- **Volume**: chat traces are long (up to 120 s streams, multi-step tool
  calls). Lower with `OTEL_TRACES_SAMPLER=traceidratio` +
  `OTEL_TRACES_SAMPLER_ARG=0.2` if needed.
