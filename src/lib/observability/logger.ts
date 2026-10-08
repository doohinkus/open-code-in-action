type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
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
