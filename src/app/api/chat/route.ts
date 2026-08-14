import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, appendResponseMessages } from "ai";
import * as Sentry from "@sentry/nextjs";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";
import { prepareModelMessages } from "@/lib/message-compaction";
import { logger, getRequestId, hashIp } from "@/lib/observability/logger";
import { isAllowedModel } from "@/lib/models";
import {
  isAllowedOrigin,
  allowedOriginFor,
} from "@/lib/origins";

const MAX_MESSAGE_COUNT = 200;
const MAX_MESSAGE_LENGTH = 50_000;
const MAX_TOTAL_MESSAGES_LENGTH = 500_000;
const MAX_FILES_COUNT = 500;
const MAX_FILE_SIZE = 100_000;

// Server-side virtual filesystem cache so clients don't resend every file
// with each request. Best-effort (in-memory): a cache miss triggers a client
// resync (HTTP 428), after which the client retries with the full payload.
const VFS_CACHE_TTL_MS = 10 * 60 * 1000;
const VFS_CACHE_MAX_ENTRIES = 100;
const vfsCache = new Map<
  string,
  { revision: number; fileSystem: VirtualFileSystem; expiresAt: number }
>();

const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function getClientIp(req: Request): string {
  // Prefer the proxy-set x-real-ip over the client-influencable X-Forwarded-For.
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  // Opportunistically prune expired entries so the map doesn't grow unbounded.
  if (ipRequestCounts.size > 1000) {
    for (const [key, entry] of ipRequestCounts) {
      if (entry.resetAt <= now) ipRequestCounts.delete(key);
    }
  }
  const entry = ipRequestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRequestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  return true;
}

function pruneVfsCache(): void {
  const now = Date.now();
  for (const [key, entry] of vfsCache) {
    if (entry.expiresAt <= now) vfsCache.delete(key);
  }
  if (vfsCache.size > VFS_CACHE_MAX_ENTRIES) {
    const sorted = [...vfsCache.entries()].sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt
    );
    for (let i = 0; i < vfsCache.size - VFS_CACHE_MAX_ENTRIES; i++) {
      vfsCache.delete(sorted[i][0]);
    }
  }
}

type VfsResolution =
  | { fileSystem: VirtualFileSystem }
  | { resync: true };

// Use a cached virtual filesystem when the client omits files (the common
// case after the first request). Missing/stale caches return resync so the
// client re-sends the full payload.
function resolveFileSystem(
  files: Record<string, FileNode> | undefined,
  cacheKey: string | null,
  vfsRevision: number | undefined
): VfsResolution {
  if (files !== undefined) {
    const fs = new VirtualFileSystem();
    fs.deserializeFromNodes(files);
    if (cacheKey) {
      vfsCache.set(cacheKey, {
        revision: vfsRevision ?? 0,
        fileSystem: fs,
        expiresAt: Date.now() + VFS_CACHE_TTL_MS,
      });
      pruneVfsCache();
    }
    return { fileSystem: fs };
  }

  const cached = cacheKey ? vfsCache.get(cacheKey) : undefined;
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.revision === (vfsRevision ?? 0)
  ) {
    // Clone so tool calls during this request don't mutate the shared cache.
    const fs = new VirtualFileSystem();
    fs.deserializeFromNodes(cached.fileSystem.serialize());
    return { fileSystem: fs };
  }

  return { resync: true };
}

function hasRealProvider(): boolean {
  if (process.env.FORCE_MOCK_PROVIDER?.trim() === "1") {
    return false;
  }
  return !!(process.env.GOOGLE_API_KEY?.trim()) ||
         !!(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim() !== "your-api-key-here") ||
         !!(process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() && process.env.OPENAI_COMPATIBLE_MODEL?.trim());
}

function isUsingAnthropic(): boolean {
  return !process.env.GOOGLE_API_KEY?.trim() &&
         !process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() &&
         !!(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim() !== "your-api-key-here");
}

// Stream errors can be Error instances or plain provider objects (e.g.
// { error: { type, message } }). Produce a readable message so the client
// can surface the real cause instead of the SDK's masked default.
function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nested = record.error as Record<string, unknown> | undefined;
    const message = record.message ?? nested?.message ?? nested?.type;
    if (typeof message === "string" && message) return message;
    try {
      return JSON.stringify(error);
    } catch {
      // fall through to the generic string below
    }
  }
  return String(error ?? "An error occurred.");
}

function checkOrigin(req: Request): boolean {
  const originHeader = req.headers.get("origin") || "";
  if (originHeader) {
    return isAllowedOrigin(originHeader);
  }
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      return isAllowedOrigin(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

function validateInput(
  messages: any[],
  files: Record<string, FileNode> | undefined
): string | null {
  if (!Array.isArray(messages)) return "messages must be an array";
  if (messages.length > MAX_MESSAGE_COUNT) {
    return `messages count exceeds limit of ${MAX_MESSAGE_COUNT}`;
  }
  let totalLen = 0;
  for (const msg of messages) {
    if (msg.role === "system") return "cannot include system messages";
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
    if (content.length > MAX_MESSAGE_LENGTH) {
      return `message exceeds maximum length of ${MAX_MESSAGE_LENGTH}`;
    }
    totalLen += content.length;
    if (totalLen > MAX_TOTAL_MESSAGES_LENGTH) {
      return `total messages length exceeds limit of ${MAX_TOTAL_MESSAGES_LENGTH}`;
    }
  }

  // Files are optional: they are omitted once the server has a cached VFS.
  if (files !== undefined) {
    if (typeof files !== "object" || files === null) return "files must be an object";
    const fileKeys = Object.keys(files);
    if (fileKeys.length > MAX_FILES_COUNT) {
      return `files count exceeds limit of ${MAX_FILES_COUNT}`;
    }
    for (const [path, node] of Object.entries(files)) {
      if (node.content && node.content.length > MAX_FILE_SIZE) {
        return `file ${path} exceeds maximum size of ${MAX_FILE_SIZE}`;
      }
    }
  }

  return null;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = allowedOriginFor(origin);

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Persist a turn's messages and files with an optimistic-concurrency guard
// (version compare-and-swap) so concurrent turns for the same project don't
// silently overwrite each other. Returns "conflict" when the row's version
// moved since the request started; the caller can rebase and retry.
async function persistProjectTurn(
  projectId: string,
  userId: string,
  expectedVersion: number,
  messagesJson: string,
  dataJson: string,
  requestId: string
): Promise<"ok" | "conflict" | "error"> {
  try {
    const result = await prisma.project.updateMany({
      where: { id: projectId, userId, version: expectedVersion },
      data: {
        messages: messagesJson,
        data: dataJson,
        version: { increment: 1 },
      },
    });
    return result.count === 0 ? "conflict" : "ok";
  } catch (error) {
    logger.error("chat.project.save_failed", {
      requestId,
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error, {
      tags: { requestId },
      extra: { projectId },
    });
    return "error";
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  logger.info("chat.request.start", {
    requestId,
    ip: hashIp(ip),
    provider: hasRealProvider() ? "real" : "mock",
  });

  if (!checkRateLimit(ip)) {
    logger.warn("chat.request.rate_limited", { requestId, ip: hashIp(ip) });
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  if (!checkOrigin(req)) {
    logger.warn("chat.request.bad_origin", {
      requestId,
      origin: req.headers.get("origin") || req.headers.get("referer") || "",
    });
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const session = await getSession();

  const {
    messages,
    files,
    projectId,
    sessionKey,
    vfsRevision,
    test,
    model,
  }: {
    messages: any[];
    files?: Record<string, FileNode>;
    projectId?: string;
    sessionKey?: string;
    vfsRevision?: number;
    test?: boolean;
    model?: string;
  } = await req.json();

  const validationError = validateInput(messages, files);
  if (validationError) {
    logger.warn("chat.request.invalid", {
      requestId,
      reason: validationError,
    });
    return Response.json({ error: validationError }, { status: 400 });
  }

  // Validate the client-supplied anonymous session key. It is used as part of
  // the VFS cache key, so reject malformed/oversized values instead of
  // letting an attacker stash arbitrary data under a cache entry.
  if (sessionKey !== undefined && (typeof sessionKey !== "string" || !/^anon-[A-Za-z0-9-]{8,64}$/.test(sessionKey))) {
    logger.warn("chat.request.invalid_session_key", { requestId });
    return Response.json({ error: "Invalid session key" }, { status: 400 });
  }

  // vfsRevision is a client-reported counter that selects which cached
  // filesystem the server should serve. Reject anything that isn't a
  // non-negative integer.
  if (vfsRevision !== undefined && (typeof vfsRevision !== "number" || !Number.isInteger(vfsRevision) || vfsRevision < 0)) {
    logger.warn("chat.request.invalid_vfs_revision", { requestId });
    return Response.json({ error: "Invalid vfsRevision" }, { status: 400 });
  }

  let sessionUserId: string | null = null;
  if (session) {
    sessionUserId = session.userId;
  }

  // Require authentication for project saves
  if (projectId && !session) {
    logger.warn("chat.request.unauthorized", { requestId, projectId });
    return Response.json(
      { error: "Authentication required to save to a project" },
      { status: 401 }
    );
  }

  // Verify the caller actually owns the project and capture its version for
  // optimistic-concurrency on the save. This also prevents reading another
  // user's cached filesystem via a guessed projectId.
  let projectVersion = 0;
  if (projectId && sessionUserId) {
    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId: sessionUserId },
      select: { id: true, version: true },
    });
    if (!owned) {
      logger.warn("chat.request.project_forbidden", { requestId, projectId });
      return Response.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }
    projectVersion = owned.version;
  }

  // Keep the full, unmodified history for persistence; build a reduced copy
  // for the model so old code and reasoning tokens aren't re-sent.
  const originalMessages: any[] = messages;
  const modelMessages: any[] = prepareModelMessages(messages);

  modelMessages.unshift({
    role: "system",
    content: generationPrompt,
    ...(isUsingAnthropic() ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } } : {}),
  });

  // Reconstruct the VirtualFileSystem, preferring the server-side cache when
  // the client omits files. A cache miss asks the client to resync (428).
  // Project cache keys are scoped by userId so one user can never read or
  // poison another user's cached filesystem.
  const cacheKey = projectId
    ? `project:${sessionUserId}:${projectId}`
    : sessionKey
      ? `anon:${sessionKey}`
      : null;
  const vfsResolution = resolveFileSystem(files, cacheKey, vfsRevision);
  if ("resync" in vfsResolution) {
    logger.info("chat.request.vfs_resync", { requestId, cacheKey });
    return Response.json(
      { error: "Filesystem resync required", code: "VFS_RESYNC_REQUIRED" },
      { status: 428 }
    );
  }
  const fileSystem = vfsResolution.fileSystem;

  // Client may request a specific model (e.g. a free Zen model selected in
  // the UI). Unknown models fall back to the server default rather than
  // erroring, so stale selections don't break requests.
  const requestedModel = model && isAllowedModel(model) ? model : undefined;
  if (model && !requestedModel) {
    logger.warn("chat.request.unknown_model", {
      requestId,
      model,
    });
  }
  const activeModelId = requestedModel ?? process.env.OPENAI_COMPATIBLE_MODEL?.trim();

  const languageModel = getLanguageModel(requestedModel);
  // Test-connection requests are minimal: one model call, tiny output.
  const isTestRequest = test === true;
  // Use fewer steps for mock provider to prevent repetition
  const maxSteps = isTestRequest ? 1 : hasRealProvider() ? 5 : 4;
  const maxTokens = isTestRequest ? 64 : 10_000;

  const reasoningOptions: Record<string, any> = {};
  if (
    process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() &&
    process.env.OPENAI_COMPATIBLE_MODEL?.trim()
  ) {
    reasoningOptions["opencode-compatible"] = { reasoningEffort: "low" };
  }

  const { span, finish: finishSpan } = Sentry.startSpanManual(
    {
      name: "chat.generation",
      op: "ai.generate",
      attributes: {
        provider: hasRealProvider() ? "real" : "mock",
        projectId: projectId ?? "anonymous",
        ...(activeModelId && { model: activeModelId }),
      },
    },
    (span, finish) => ({ span, finish })
  );

  const result = streamText({
    model: languageModel,
    messages: modelMessages,
    maxTokens,
    maxSteps,
    // Fail fast on provider errors (e.g. rate limits) instead of the SDK's
    // default 3 attempts, which multiply requests against the provider's quota.
    maxRetries: 0,
    ...(Object.keys(reasoningOptions).length > 0 && { providerOptions: reasoningOptions }),
    onError: (err: any) => {
      logger.error("chat.stream.error", {
        requestId,
        error: describeError(err),
      });
      Sentry.captureException(err, { tags: { requestId } });
      span.setAttribute("finishReason", "error");
      finishSpan();
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    onFinish: async ({ response, usage, finishReason, steps }) => {
      const toolCallCount = steps.reduce(
        (acc, step) => acc + (step.toolCalls?.length ?? 0),
        0
      );
      const durationMs = Date.now() - startedAt;

      span.setAttributes({
        finishReason,
        steps: steps.length,
        toolCalls: toolCallCount,
        promptTokens: usage?.promptTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
        ...(activeModelId && { model: activeModelId }),
      });
      Sentry.setMeasurement("latency_ms", durationMs, "millisecond", span);
      finishSpan();

      logger.info("chat.request.finish", {
        requestId,
        durationMs,
        finishReason,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        steps: steps.length,
        toolCalls: toolCallCount,
        projectId: projectId ?? null,
        ...(activeModelId && { model: activeModelId }),
      });

      // Save to project if projectId is provided (auth already verified above)
      if (projectId && sessionUserId) {
        try {
          // Get the messages from the response
          const responseMessages = response.messages || [];
          // Combine original messages with response messages
          const allMessages = appendResponseMessages({
            messages: originalMessages,
            responseMessages,
          });

          let outcome = await persistProjectTurn(
            projectId,
            sessionUserId,
            projectVersion,
            JSON.stringify(allMessages),
            JSON.stringify(fileSystem.serialize()),
            requestId
          );

          if (outcome === "conflict") {
            // A concurrent turn for this project committed first. Re-read the
            // current row and re-base this turn's response messages on top of
            // it, keeping the already-committed file state (this turn's file
            // edits were made against stale state).
            const current = await prisma.project.findUnique({
              where: { id: projectId, userId: sessionUserId },
              select: { messages: true, data: true, version: true },
            });

            if (current) {
              let currentMessages: any[] = [];
              try {
                const parsed = JSON.parse(current.messages);
                if (Array.isArray(parsed)) currentMessages = parsed;
              } catch {
                currentMessages = [];
              }

              const rebased = appendResponseMessages({
                messages: currentMessages,
                responseMessages,
              });

              outcome = await persistProjectTurn(
                projectId,
                sessionUserId,
                current.version,
                JSON.stringify(rebased),
                current.data,
                requestId
              );

              if (outcome === "ok") {
                logger.warn("chat.project.save_rebased", {
                  requestId,
                  projectId,
                });
              }
            }
          }
        } catch (error) {
          logger.error("chat.project.save_failed", {
            requestId,
            projectId,
            error: error instanceof Error ? error.message : String(error),
          });
          Sentry.captureException(error, {
            tags: { requestId },
            extra: { projectId },
          });
        }
      }
    },
  });

  const aiResponse = result.toDataStreamResponse({
    sendReasoning: true,
    getErrorMessage: describeError,
  });

  // Add CORS headers for credentialed requests
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = allowedOriginFor(origin);

  const responseHeaders = new Headers(aiResponse.headers);
  responseHeaders.set("Access-Control-Allow-Origin", allowedOrigin);
  responseHeaders.set("Access-Control-Allow-Credentials", "true");

  return new Response(aiResponse.body, {
    status: aiResponse.status,
    statusText: aiResponse.statusText,
    headers: responseHeaders,
  });
}

export const maxDuration = 120;
