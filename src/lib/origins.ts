const BASE_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://open-code-in-action.vercel.app",
];

// Exact-match allowlist. Env-provided origins (production app URL, current
// Vercel preview deployment) are appended at runtime; no wildcard suffixes.
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>(BASE_ALLOWED_ORIGINS);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (appUrl) origins.add(appUrl.replace(/\/+$/, ""));
  if (vercelUrl) origins.add(`https://${vercelUrl.replace(/\/+$/, "")}`);
  return [...origins];
}

export function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function isAllowedOrigin(origin: string): boolean {
  return getAllowedOrigins().includes(normalizeOrigin(origin));
}

// Returns the request's origin when it is allowed, otherwise a safe default
// that browsers will refuse to match for credentialed cross-origin reads.
export function allowedOriginFor(origin: string): string {
  return isAllowedOrigin(origin) ? normalizeOrigin(origin) : getAllowedOrigins()[0];
}
