import { createNeonAuth } from "@neondatabase/auth/next/server";

let _auth: ReturnType<typeof createNeonAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    if (!process.env.NEON_AUTH_BASE_URL || !process.env.NEON_AUTH_COOKIE_SECRET) {
      throw new Error(
        "Missing Neon Auth environment variables: NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set"
      );
    }
    _auth = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL,
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET,
      },
    });
  }
  return _auth;
}
