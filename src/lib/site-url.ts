import "server-only";
import { headers } from "next/headers";

const FALLBACK_URL = "http://localhost:3000";

function vercelOrigin(): string | null {
  const origin = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return origin ? `https://${origin}` : null;
}

export const siteUrlFallback: string =
  process.env.NEXT_PUBLIC_APP_URL || vercelOrigin() || FALLBACK_URL;

export async function getSiteUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwarded || h.get("host") || null;

    if (!host) return siteUrlFallback;

    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol =
      proto || (process.env.NODE_ENV === "production" ? "https" : "http");
    return `${protocol}://${host}`;
  } catch {
    return siteUrlFallback;
  }
}
