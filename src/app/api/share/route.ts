import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logger, getRequestId, hashIp } from "@/lib/observability/logger";
import { isAllowedOrigin } from "@/lib/origins";
import {
  parseShareFiles,
  validateShareInput,
  upsertShare,
} from "@/lib/share";

export const runtime = "nodejs";
export const maxDuration = 60;

const ipShareCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function getClientIp(req: Request): string {
  // Prefer the proxy-set x-real-ip over the client-influencable X-Forwarded-For.
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Opportunistically prune expired entries so the map doesn't grow unbounded.
  if (ipShareCounts.size > 1000) {
    for (const [key, entry] of ipShareCounts) {
      if (entry.resetAt <= now) ipShareCounts.delete(key);
    }
  }
  const entry = ipShareCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipShareCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX_REQUESTS;
}

function isAllowedOriginForRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Share creation is token-based and intentionally open to anonymous,
  // non-browser clients (curl, OG scrapers), so a missing Origin is allowed.
  if (!origin) return true;
  return isAllowedOrigin(origin);
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const ipHash = hashIp(getClientIp(req));

  if (!isAllowedOriginForRequest(req)) {
    return NextResponse.json(
      { error: "Request blocked. Please try again." },
      { status: 403 }
    );
  }

  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const files = parseShareFiles(body?.files);
  if (!files) {
    return NextResponse.json(
      { error: "files must be a map of file path to string content" },
      { status: 400 }
    );
  }

  const input = {
    files,
    name: body?.name,
    projectId: body?.projectId,
    previousToken: body?.previousToken,
  };

  const validationError = validateShareInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  let session = null;
  try {
    session = await getSession();
  } catch {
    // Optional auth — anonymous users may create share links.
  }

  try {
    const result = await upsertShare({
      ...input,
      userId: session?.userId,
    });

    const origin = new URL(req.url).origin;
    logger.info("share.upserted", {
      requestId,
      tokenPrefix: result.token.slice(0, 8),
      created: result.created,
      userId: session?.userId ?? null,
      ipHash,
      fileCount: Object.keys(files).length,
    });

    return NextResponse.json({
      url: `${origin}/s/${result.token}`,
      created: result.created,
    });
  } catch (error) {
    logger.error("share.upsert_failed", {
      requestId,
      userId: session?.userId ?? null,
      ipHash,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
