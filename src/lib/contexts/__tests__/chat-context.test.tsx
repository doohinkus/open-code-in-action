import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, cleanup } from "@testing-library/react";
import { ChatProvider, useChat } from "../chat-context";
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
  });

  test("renders with default values", () => {
    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider projectId="test-project" initialMessages={initialMessages}>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider projectId="test-project">
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(screen.getByTestId("status").textContent).toBe("loading");

    // Verify functions are passed through
    const textarea = screen.getByTestId("input");
    const form = screen.getByTestId("form");

    expect(textarea).toBeDefined();
    expect(form).toBeDefined();
  });

  test("handles tool calls", () => {
    let onToolCallHandler: any;

    (useAIChat as any).mockImplementation((config: any) => {
      onToolCallHandler = config.onToolCall;
      return mockUseAIChat;
    });

    render(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "ready",
      append: mockAppend,
    });

    rerender(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
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
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    (useAIChat as any).mockReturnValue({
      ...mockUseAIChat,
      status: "error",
      append: mockAppend,
    });

    rerender(
      <ChatProvider>
        <TestComponent />
      </ChatProvider>
    );

    expect(mockAppend).not.toHaveBeenCalled();
  });
});
