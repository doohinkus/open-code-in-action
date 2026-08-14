import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { ShareBar } from "../ShareBar";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { useChat } from "@/lib/contexts/chat-context";
import { useToast } from "@/components/ui/toast";

vi.mock("@/lib/contexts/file-system-context", () => ({
  useFileSystem: vi.fn(),
}));

vi.mock("@/lib/contexts/chat-context", () => ({
  useChat: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

const FILES = new Map<string, string>([["/App.jsx", "export default () => <div>Hi</div>;"]]);

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => store.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn((k: string) => void store.delete(k)),
    clear: vi.fn(() => void store.clear()),
    key: vi.fn((i: number) => [...store.keys()][i] ?? null),
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

describe("ShareBar auto-publish gating", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const storage = makeStorage();
    Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: storage, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ url: "https://uigen.example/share/token-abc" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.mocked(useFileSystem).mockReturnValue({
      getAllFiles: vi.fn(() => FILES),
      isFixingErrors: false,
    } as any);
    vi.mocked(useChat).mockReturnValue({
      status: "ready",
      projectId: undefined,
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test("does not publish on initial mount while status is ready", async () => {
    render(<ShareBar />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("publishes exactly once on a streaming -> ready transition", async () => {
    const { rerender } = render(<ShareBar />);

    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "streaming", projectId: undefined } as any);
      rerender(<ShareBar />);
    });
    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "ready", projectId: undefined } as any);
      rerender(<ShareBar />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/share",
      expect.objectContaining({ method: "POST" })
    );
    expect(screen.getByText(/uigen\.example\/share/)).toBeDefined();
  });

  test("does not publish while still streaming", async () => {
    const { rerender } = render(<ShareBar />);

    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "streaming", projectId: undefined } as any);
      rerender(<ShareBar />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not publish on an error -> ready transition", async () => {
    const { rerender } = render(<ShareBar />);

    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "error", projectId: undefined } as any);
      rerender(<ShareBar />);
    });
    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "ready", projectId: undefined } as any);
      rerender(<ShareBar />);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("retry button republishes after a failed share", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve(null) });

    const { rerender } = render(<ShareBar />);

    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "streaming", projectId: undefined } as any);
      rerender(<ShareBar />);
    });
    await act(async () => {
      vi.mocked(useChat).mockReturnValue({ status: "ready", projectId: undefined } as any);
      rerender(<ShareBar />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Share link failed")).toBeDefined();

    const retry = screen.getByTitle("Retry");
    await act(async () => {
      retry.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
