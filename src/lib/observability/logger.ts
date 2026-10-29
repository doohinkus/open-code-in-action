type LogLevel = "info" | "warn" | "error";

// Trace correlation is injected, not imported: this module ships in client
// bundles, so it must not statically depend on @opentelemetry/api. The
// server bootstrap (src/lib/otel.ts) registers a source that reads the
// active span; without one, log lines look exactly as before.
// The source lives on globalThis, not a module local: Next bundles
// instrumentation.ts and route handlers as separate module instances, so a
// plain module variable registered in one copy would be invisible to the
// other. (Same reason @opentelemetry/api itself uses a global registry.)
type TraceContext = { trace_id: string; span_id: string };
const TRACE_SOURCE_KEY = "__uigenTraceContextSource";

export function setTraceContextSource(
  source: (() => TraceContext | undefined) | null
): void {
  (globalThis as Record<string, unknown>)[TRACE_SOURCE_KEY] = source ?? undefined;
}

function getTraceContextSource(): (() => TraceContext | undefined) | null {
  return (
    (globalThis as Record<string, unknown>)[TRACE_SOURCE_KEY] as
      | (() => TraceContext | undefined)
      | undefined
  ) ?? null;
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  const source = getTraceContextSource();
  let traceFields: TraceContext | undefined;
  if (source) {
    try {
      traceFields = source();
    } catch {
      traceFields = undefined;
    }
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...traceFields,
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(message: string, fields?: Record<string, unknown>) {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>) {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>) {
    write("error", message, fields);
  },
};

const REQUEST_ID_HEADER = "x-request-id";

export function getRequestId(req: Request): string {
  const existing = req.headers.get(REQUEST_ID_HEADER)?.trim();
  // Client-supplied IDs are untrusted: cap length and restrict characters so
  // they can't inject arbitrary text into JSON log lines or blow up Sentry
  // tag payloads.
  if (existing && /^[A-Za-z0-9._:-]{1,64}$/.test(existing)) return existing;
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Secret-derived seed: with NEON_AUTH_COOKIE_SECRET (or a deployment-local
// secret) unknown to anyone reading logs, the IPv4 space is no longer
// offline-brute-forceable as it would be from a bare hash. Not a cryptographic
// PRF — if the secret leaks the hashes fall with it — but a strict upgrade
// over the previous secretless hash while staying synchronous (usable from
// both runtimes and client bundles, where Web Crypto's async HMAC can't fit).
let ipHashSeed: number | null = null;

function getIpHashSeed(): number {
  if (ipHashSeed === null) {
    const secret =
      process.env.NEON_AUTH_COOKIE_SECRET || "uigen-unconfigured-log-secret";
    let h = 0x811c9dc5;
    for (let i = 0; i < secret.length; i++) {
      h ^= secret.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    ipHashSeed = h >>> 0;
  }
  return ipHashSeed;
}

export function hashIp(ip: string): string {
  let h = getIpHashSeed();
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= ip.length;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return `ip_${h.toString(36)}`;
}
