import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "__Secure-neon-auth.session_token";

let neonAuthHandler: any = null;

async function getNeonAuthHandler() {
  if (neonAuthHandler) return neonAuthHandler;

  const { createNeonAuth } = await import("@neondatabase/auth/next/server");
  const rawBaseUrl = process.env.NEON_AUTH_BASE_URL?.trim() ?? "";
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET?.trim() ?? "";
  const baseUrl = rawBaseUrl.replace(/^NEON_AUTH_BASE_URL=/, "");

  const auth = createNeonAuth({
    baseUrl,
    cookies: { secret: cookieSecret },
  });

  neonAuthHandler = auth.middleware({
    loginUrl: "/__neon_auth_noop",
  });
  return neonAuthHandler;
}

export async function middleware(request: NextRequest) {
  const handler = await getNeonAuthHandler();
  const neonAuthResponse = await handler(request);

  const status = neonAuthResponse.status;
  const isRedirect = [301, 302, 307, 308].includes(status);

  if (isRedirect) {
    const setCookieHeader = neonAuthResponse.headers.get("set-cookie") ?? "";
    const hasSessionCookie = setCookieHeader.includes("session_token");

    if (hasSessionCookie) {
      return neonAuthResponse;
    }

    // Unauthenticated user redirected to login — let them through
    return NextResponse.next();
  }

  // Neon Auth returned allow — may have refreshed session cookies
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const isAuthenticated = !!sessionCookie;

  const protectedPaths = ["/api/projects", "/api/filesystem"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !isAuthenticated) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  return neonAuthResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
