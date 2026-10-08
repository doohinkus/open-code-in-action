import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

let neonAuthHandler: any = null;

async function getNeonAuthHandler() {
  if (neonAuthHandler) return neonAuthHandler;

  // Share the app's single Neon Auth instance (env validation included)
  // instead of a second, unvalidated createNeonAuth duplicate.
  const { getAuth } = await import("@/lib/auth/server");
  neonAuthHandler = getAuth().middleware({
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

  const protectedPaths = ["/api/projects", "/api/filesystem"];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath) {
    // Verify the session (signature-checked), not merely cookie presence: a
    // forged cookie value must not pass. Fail closed — getSession failing in
    // this runtime context blocks the protected paths rather than bypassing.
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      if (!session?.userId) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  return neonAuthResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
