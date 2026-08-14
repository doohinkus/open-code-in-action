import { test, expect, describe, vi, beforeEach } from "vitest";
import { POST, OPTIONS } from "@/app/api/chat/route";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamText } from "ai";

vi.mock("server-only", () => ({}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
  appendResponseMessages: vi.fn(({ messages }: any) => messages),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/provider", () => ({
  buildLanguageModel: vi.fn(() => ({ modelId: "test-model", provider: "mock" })),
}));

vi.mock("@/lib/models", () => ({
  isAllowedModel: vi.fn(() => false),
}));

vi.mock("@/lib/message-compaction", () => ({
  prepareModelMessages: vi.fn((m: unknown[]) => m),
}));

vi.mock("@/lib/prompts/generation", () => ({
  generationPrompt: "test prompt",
}));

vi.mock("@/lib/tools/str-replace", () => ({
  buildStrReplaceTool: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/tools/file-manager", () => ({
  buildFileManagerTool: vi.fn(() => vi.fn()),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  startSpanManual: vi.fn((_opts: unknown, cb: (span: any, finish: any) => any) =>
    cb(
      {
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        finish: vi.fn(),
      },
      vi.fn()
    )
  ),
  setMeasurement: vi.fn(),
}));

const VALID_ORIGIN = "http://localhost:3000";

function makeRequest(body: unknown, headers: Record<string, string | null> = {}) {
  const { Origin = VALID_ORIGIN, ...rest } = headers;
  const headerEntries: Record<string, string> = { "Content-Type": "application/json" };
  if (Origin !== null) headerEntries.Origin = Origin;
  for (const [key, value] of Object.entries(rest)) {
    if (value !== null) headerEntries[key] = value;
  }
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: headerEntries,
    body: JSON.stringify(body),
  });
}

describe("chat route hardening", () => {
  const projectMock = prisma.project as unknown as {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(null as any);
    vi.mocked(streamText).mockReturnValue({
      toDataStreamResponse: vi.fn(() =>
        new Response("ok", { status: 200, headers: {} })
      ),
    } as any);
  });

  test("rejects requests from disallowed origins", async () => {
    const res = await POST(makeRequest({ messages: [] }, { Origin: "http://evil.example" }));
    expect(res.status).toBe(403);
    expect(streamText).not.toHaveBeenCalled();
  });

  test("rejects requests with no origin or referer", async () => {
    const res = await POST(makeRequest({ messages: [] }, { Origin: null }));
    expect(res.status).toBe(403);
  });

  test("rejects malformed sessionKey", async () => {
    const res = await POST(
      makeRequest({ messages: [], sessionKey: "anon-abc" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid session key" });
  });

  test("accepts a valid anon sessionKey format", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        sessionKey: "anon-abcdefghijklmnop",
      })
    );
    expect(res.status).not.toBe(400);
  });

  test("rejects negative vfsRevision", async () => {
    const res = await POST(makeRequest({ messages: [], vfsRevision: -1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid vfsRevision" });
  });

  test("rejects fractional vfsRevision", async () => {
    const res = await POST(makeRequest({ messages: [], vfsRevision: 1.5 }));
    expect(res.status).toBe(400);
  });

  test("rejects unauthenticated project saves with 401", async () => {
    const res = await POST(
      makeRequest({ messages: [], projectId: "project-1" })
    );
    expect(res.status).toBe(401);
  });

  test("rejects non-owner project access with 404", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: "user-1" } as any);
    projectMock.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        files: { "/App.jsx": { type: "file", content: "x" } },
        projectId: "project-1",
      })
    );
    expect(res.status).toBe(404);
    expect(streamText).not.toHaveBeenCalled();
  });

  test("allows the project owner through to generation", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: "user-1" } as any);
    projectMock.findFirst.mockResolvedValue({ id: "project-1", version: 3 });

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        files: { "/App.jsx": { type: "file", content: "x" } },
        projectId: "project-1",
      })
    );
    expect(res.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  test("rejects oversized message bodies", async () => {
    const res = await POST(
      makeRequest({
        messages: [
          { role: "user", content: "x".repeat(60_000) },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  test("OPTIONS returns CORS headers for an allowed origin", async () => {
    const req = new Request("http://localhost:3000/api/chat", {
      method: "OPTIONS",
      headers: { Origin: VALID_ORIGIN },
    });
    const res = await OPTIONS(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(VALID_ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  // Simulate the streaming SDK: capture the onFinish callback so tests can
  // drive the optimistic-concurrency save that runs after a stream ends.
  function captureOnFinishAndRespond() {
    let onFinishCb: ((args: any) => Promise<void>) | null = null;
    vi.mocked(streamText).mockImplementation(((config: any) => {
      onFinishCb = config.onFinish;
      return {
        toDataStreamResponse: vi.fn(() =>
          new Response("ok", { status: 200, headers: {} })
        ),
      };
    }) as any);
    return (args: any) => onFinishCb?.(args);
  }

  const finishArgs = {
    response: { messages: [{ id: "r1", role: "assistant", content: "hi" }] },
    usage: { promptTokens: 1, completionTokens: 1 },
    finishReason: "stop",
    steps: [],
  };

  test("saves a project turn with a version CAS guard", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: "user-1" } as any);
    projectMock.findFirst.mockResolvedValue({ id: "project-1", version: 3 });
    projectMock.updateMany.mockResolvedValue({ count: 1 });
    const runOnFinish = captureOnFinishAndRespond();

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        files: { "/App.jsx": { type: "file", content: "x" } },
        projectId: "project-1",
      })
    );
    expect(res.status).toBe(200);

    await runOnFinish(finishArgs);

    expect(projectMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "project-1", userId: "user-1", version: 3 },
        data: expect.objectContaining({
          version: { increment: 1 },
          data: expect.any(String),
          messages: expect.any(String),
        }),
      })
    );
  });

  test("rebases onto the latest row when the version CAS conflicts", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: "user-1" } as any);
    projectMock.findFirst.mockResolvedValue({ id: "project-1", version: 3 });
    // First CAS write loses; a concurrent turn committed version 4 first.
    projectMock.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    projectMock.findUnique.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      messages: "[]",
      data: "{}",
      version: 4,
    });
    const runOnFinish = captureOnFinishAndRespond();

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hi" }],
        files: { "/App.jsx": { type: "file", content: "x" } },
        projectId: "project-1",
      })
    );
    expect(res.status).toBe(200);

    await runOnFinish(finishArgs);

    expect(projectMock.updateMany).toHaveBeenCalledTimes(2);
    // The retry must target the freshly-read version.
    const retryArgs = projectMock.updateMany.mock.calls[1][0];
    expect(retryArgs.where).toEqual({
      id: "project-1",
      userId: "user-1",
      version: 4,
    });
  });
});
