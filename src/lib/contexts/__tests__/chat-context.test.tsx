import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { ChatProvider, useChat } from "../chat-context";
import { ToastProvider } from "@/components/ui/toast";
import { useFileSystem } from "../file-system-context";
import { useChat as useAIChat } from "@ai-sdk/react";
import * as anonTracker from "@/lib/anon-work-tracker";

// Mock dependencies
vi.mock("../file-system-context", () => ({
  useFileSystem: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  setHasAnonWork: vi.fn(),
  getOrCreateAnonSessionKey: vi.fn(() => "anon-test-key"),
}));

vi.mock("@/lib/model-selector", () => ({
  getStoredModel: vi.fn(() => "deepseek-v4-flash-free"),
}));

// Helper component to access chat context
function TestComponent() {
  const chat = useChat();
  return (
    <div>
      <div data-testid="messages">{chat.messages.length}</div>
      <textarea
        data-testid="input"
        value={chat.input}
        onChange={chat.handleInputChange}
      />
      <form data-testid="form" onSubmit={chat.handleSubmit}>
        <button type="submit">Submit</button>
      </form>
      <button type="button" data-testid="stop" onClick={() => chat.stop()}>
        Stop
      </button>
      <div data-testid="status">{chat.status}</div>
      <div data-testid="interrupted">
        {chat.generationInterrupted ? "true" : "false"}
      </div>
    </div>
  );
}

describe("ChatContext", () => {
  const mockFileSystem = {
    serialize: vi.fn(() => ({ "/test.js": { type: "file", content: "test" } })),
  };

  const mockHandleToolCall = vi.fn();
  const mockValidateCurrentFiles = vi.fn<() => Array<{ path: string; error: string }>>(
    () => []
  );
  const mockSetIsFixingErrors = vi.fn();

  const mockUseAIChat = {
    messages: [],
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    status: "idle",
    stop: vi.fn(),
    append: vi.fn(),
    reload: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useFileSystem as any).mockReturnValue({
      fileSystem: mockFileSystem,
      handleToolCall: mockHandleToolCall,
      validateCurrentFiles: mockValidateCurrentFiles,
      setIsFixingErrors: mockSetIsFixingErrors,
      vfsRevision: 0,
    });

    (useAIChat as any).mockReturnValue(mockUseAIChat);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("renders with default values", () => {
    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    expect(screen.getByTestId("messages").textContent).toBe("0");
    expect(screen.getByTestId("input").getAttribute("value")).toBe(null);
    expect(screen.getByTestId("status").textContent).toBe("idle");
  });

  test("initializes with project ID and messages", () => {
    const initialMessages = [
      { id: "1", role: "user" as const, content: "Hello" },
      { id: "2", role: "assistant" as const, content: "Hi there!" },
    ];

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      messages: initialMessages,
    });

    render(
      <ToastProvider>
      <ChatProvider projectId="test-project" initialMessages={initialMessages}>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    expect(useAIChat).toHaveBeenCalledWith({
      api: "/api/chat",
      initialMessages,
      fetch: expect.any(Function),
      experimental_prepareRequestBody: expect.any(Function),
      onToolCall: expect.any(Function),
      onFinish: expect.any(Function),
    });

    expect(screen.getByTestId("messages").textContent).toBe("2");
  });

  test("sets generationInterrupted when the stream ends without a finish reason", () => {
    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    const useAIChatMock = useAIChat as any;
    const onFinish = useAIChatMock.mock.calls[0][0].onFinish;

    act(() => {
      onFinish({ message: {}, finishReason: "unknown", usage: {} });
    });

    expect(screen.getByTestId("interrupted").textContent).toBe("true");
  });

  test("does not set generationInterrupted on a normal finish", () => {
    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    const useAIChatMock = useAIChat as any;
    const onFinish = useAIChatMock.mock.calls[0][0].onFinish;

    act(() => {
      onFinish({ message: {}, finishReason: "stop", usage: {} });
    });

    expect(screen.getByTestId("interrupted").textContent).toBe("false");
  });

  test("tracks anonymous work when no project ID", async () => {
    const mockMessages = [{ id: "1", role: "user", content: "Hello" }];

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      messages: mockMessages,
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(anonTracker.setHasAnonWork).toHaveBeenCalledWith(
        mockMessages,
        mockFileSystem.serialize()
      );
    });
  });

  test("does not track anonymous work when project ID exists", async () => {
    const mockMessages = [{ id: "1", role: "user", content: "Hello" }];

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      messages: mockMessages,
    });

    render(
      <ToastProvider>
      <ChatProvider projectId="test-project">
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(anonTracker.setHasAnonWork).not.toHaveBeenCalled();
  });

  test("passes through AI chat functionality", () => {
    const mockHandleInputChange = vi.fn();
    const mockHandleSubmit = vi.fn();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      handleInputChange: mockHandleInputChange,
      handleSubmit: mockHandleSubmit,
      status: "loading",
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("loading");

    // Verify functions are passed through
    const textarea = screen.getByTestId("input");
    const form = screen.getByTestId("form");

    expect(textarea).toBeDefined();
    expect(form).toBeDefined();
  });

  test("includes the stored model in the request body", () => {
    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    const useAIChatMock = useAIChat as any;
    const prepare =
      useAIChatMock.mock.calls[0][0].experimental_prepareRequestBody;

    const body = prepare({
      id: "req-1",
      messages: [{ role: "user", content: "hi" }],
      requestData: undefined,
      requestBody: {},
    });

    expect(body.model).toBe("deepseek-v4-flash-free");
  });

  function renderAndCaptureVfsFetch() {
    let fetchFn: any;
    let prepareFn: any;

    (useAIChat as any).mockImplementation((config: any) => {
      fetchFn = config.fetch;
      prepareFn = config.experimental_prepareRequestBody;
      return mockUseAIChat;
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    return {
      fetchFn,
      buildBody: () =>
        prepareFn({
          id: "req-1",
          messages: [{ role: "user", content: "hi" }],
          requestData: undefined,
          requestBody: {},
        }),
    };
  }

  test("ships the full filesystem on the first request (revision mismatch)", () => {
    const { buildBody } = renderAndCaptureVfsFetch();

    const body = buildBody();
    expect(body.files).toBeDefined();
    expect(body.vfsRevision).toBe(0);
  });

  test("marks the revision synced only after a successful resync retry", async () => {
    const globalFetch = vi.fn()
      .mockResolvedValueOnce(new Response("resync", { status: 428 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", globalFetch);

    const { fetchFn, buildBody } = renderAndCaptureVfsFetch();
    await fetchFn("/api/chat", { body: JSON.stringify(buildBody()) });

    expect(globalFetch).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse((globalFetch.mock.calls[1][1] as any).body);
    expect(retryBody.files).toBeDefined();

    // After the successful resync, subsequent requests omit files.
    expect(buildBody().files).toBeUndefined();
  });

  test("does not mark the revision synced when the resync retry fails", async () => {
    const globalFetch = vi.fn()
      .mockResolvedValueOnce(new Response("resync", { status: 428 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", globalFetch);

    const { fetchFn, buildBody } = renderAndCaptureVfsFetch();
    await fetchFn("/api/chat", { body: JSON.stringify(buildBody()) });

    expect(globalFetch).toHaveBeenCalledTimes(2);

    // The retry failed, so the revision must NOT be acknowledged: the next
    // request still ships the full filesystem.
    expect(buildBody().files).toBeDefined();
  });

  test("handles tool calls", () => {
    let onToolCallHandler: any;

    (useAIChat as any).mockImplementation((config: any) => {
      onToolCallHandler = config.onToolCall;
      return mockUseAIChat;
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    const toolCall = { toolName: "test", args: {} };
    onToolCallHandler({ toolCall });

    expect(mockHandleToolCall).toHaveBeenCalledWith(toolCall);
  });

  test("watchdog stops generation when there is no stream activity", () => {
    vi.useFakeTimers();
    const mockStop = vi.fn();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
      stop: mockStop,
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    act(() => {
      vi.advanceTimersByTime(131_000);
    });

    expect(mockStop).toHaveBeenCalled();
  });

  test("auto-fixes syntax errors after a successful generation", () => {
    const mockAppend = vi.fn(() => Promise.resolve());
    mockValidateCurrentFiles.mockReturnValueOnce([
      { path: "/App.jsx", error: "Unexpected token" },
    ]);

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
      append: mockAppend,
    });

    const { rerender } = render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "ready",
      append: mockAppend,
    });

    rerender(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    expect(mockAppend).toHaveBeenCalledWith({
      role: "user",
      content: expect.stringContaining("syntax errors"),
    });
  });

  test("does not auto-fix when generation ends in an error status", () => {
    const mockAppend = vi.fn();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
      append: mockAppend,
    });

    const { rerender } = render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "error",
      append: mockAppend,
    });

    rerender(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    expect(mockAppend).not.toHaveBeenCalled();
  });

  test("auto-retries once when the provider times out mid-stream", () => {
    vi.useFakeTimers();
    const mockReload = vi.fn();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "error",
      error: new Error(
        '{"error":"Streaming response failed: [504] Upstream idle timeout exceeded"}'
      ),
      reload: mockReload,
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(mockReload).toHaveBeenCalledTimes(1);

    // A second failure must NOT auto-retry again.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  test("auto-retries once when the stream ends with finishReason unknown", () => {
    vi.useFakeTimers();
    const mockReload = vi.fn();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      reload: mockReload,
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    const useAIChatMock = useAIChat as any;
    const onFinish = useAIChatMock.mock.calls[0][0].onFinish;

    act(() => {
      onFinish({ message: {}, finishReason: "unknown", usage: {} });
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  test("does not auto-retry after an explicit stop", () => {
    vi.useFakeTimers();
    const mockReload = vi.fn();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
      reload: mockReload,
    });

    const { rerender } = render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    // User presses Stop while generating.
    act(() => {
      screen.getByTestId("stop").click();
    });

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "error",
      error: new Error(
        '{"error":"Streaming response failed: [504] Upstream idle timeout exceeded"}'
      ),
      reload: mockReload,
    });

    rerender(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockReload).not.toHaveBeenCalled();
  });

  test("warns about AI resource usage after 35s of generation", () => {
    vi.useFakeTimers();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    expect(screen.queryByText(/using lots of AI resources/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(40_000);
    });

    // Shown exactly once.
    expect(screen.getAllByText(/using lots of AI resources/i)).toHaveLength(1);
  });

  test("does not warn for a quick generation", () => {
    vi.useFakeTimers();

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "streaming",
    });

    render(
      <ToastProvider>
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
      </ToastProvider>
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText(/using lots of AI resources/i)).toBeNull();
  });
});
