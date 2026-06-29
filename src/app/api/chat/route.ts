import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, appendResponseMessages } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";

const MAX_MESSAGE_COUNT = 200;
const MAX_MESSAGE_LENGTH = 50_000;
const MAX_TOTAL_MESSAGES_LENGTH = 500_000;
const MAX_FILES_COUNT = 500;
const MAX_FILE_SIZE = 100_000;

const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
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

function hasRealProvider(): boolean {
  return !!(process.env.GOOGLE_API_KEY?.trim()) ||
         !!(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim() !== "your-api-key-here") ||
         !!(process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() && process.env.OPENAI_COMPATIBLE_MODEL?.trim());
}

function isUsingAnthropic(): boolean {
  return !process.env.GOOGLE_API_KEY?.trim() &&
         !process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() &&
         !!(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim() !== "your-api-key-here");
}

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://uigen.vercel.app",
];

function checkOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origin && !referer) return true;
  const urlToCheck = origin || referer || "";
  return ALLOWED_ORIGINS.some((allowed) => urlToCheck.startsWith(allowed));
}

function validateInput(
  messages: any[],
  files: Record<string, FileNode>
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

  return null;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  if (!checkOrigin(req)) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const session = await getSession();

  const {
    messages,
    files,
    projectId,
  }: { messages: any[]; files: Record<string, FileNode>; projectId?: string } =
    await req.json();

  const validationError = validateInput(messages, files);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  let sessionUserId: string | null = null;
  if (session) {
    sessionUserId = session.userId;
  }

  // Require authentication for project saves
  if (projectId && !session) {
    return Response.json(
      { error: "Authentication required to save to a project" },
      { status: 401 }
    );
  }

  messages.unshift({
    role: "system",
    content: generationPrompt,
    ...(isUsingAnthropic() ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } } : {}),
  });

  // Reconstruct the VirtualFileSystem from serialized data
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  // Use fewer steps for mock provider to prevent repetition
  const maxSteps = hasRealProvider() ? 40 : 4;
  const result = streamText({
    model,
    messages,
    maxTokens: 10_000,
    maxSteps,
    onError: (err: any) => {
      console.error(err);
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    onFinish: async ({ response }) => {
      // Save to project if projectId is provided (auth already verified above)
      if (projectId) {
        try {
          // Get the messages from the response
          const responseMessages = response.messages || [];
          // Combine original messages with response messages
          const allMessages = appendResponseMessages({
            messages: [...messages.filter((m) => m.role !== "system")],
            responseMessages,
          });

          await prisma.project.update({
            where: {
              id: projectId,
              userId: sessionUserId!,
            },
            data: {
              messages: JSON.stringify(allMessages),
              data: JSON.stringify(fileSystem.serialize()),
            },
          });
        } catch (error) {
          console.error("Failed to save project data:", error);
        }
      }
    },
  });

  return result.toDataStreamResponse();
}

export const maxDuration = 120;
