import { createNeonAuth } from "@neondatabase/auth/next/server";

let _auth: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    const rawBaseUrl = process.env.NEON_AUTH_BASE_URL?.trim() ?? "";
    const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim() ?? "";

    if (!rawBaseUrl || !cookieSecret) {
      throw new Error(
        "Missing Neon Auth environment variables: NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set"
      );
    }

    const baseUrl = rawBaseUrl.replace(/^NEON_AUTH_BASE_URL=/, "");

    try {
      new URL(baseUrl);
    } catch {
      throw new Error(
        `Invalid NEON_AUTH_BASE_URL: "${rawBaseUrl}" is not a valid URL. Ensure the env var value is just the URL without the key name prefix.`
      );
    }

    _auth = createNeonAuth({
      baseUrl,
      cookies: {
        secret: cookieSecret,
      },
    });
  }
  return _auth;
}
