import { describe, it, expect, vi, afterEach } from "vitest";
import { logger, setTraceContextSource } from "@/lib/observability/logger";

function lastLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls[spy.mock.calls.length - 1];
  return JSON.parse(String(call[0]));
}

describe("logger trace correlation", () => {
  afterEach(() => {
    setTraceContextSource(null);
    vi.restoreAllMocks();
  });

  it("emits plain lines with no source registered", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("hello", { requestId: "req_1" });
    expect(lastLine(spy)).toMatchObject({ level: "info", message: "hello", requestId: "req_1" });
    expect(lastLine(spy).trace_id).toBeUndefined();
  });

  it("injects trace_id/span_id from the active source", () => {
    setTraceContextSource(() => ({ trace_id: "abc123", span_id: "def456" }));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("with.trace");
    expect(lastLine(spy)).toMatchObject({ trace_id: "abc123", span_id: "def456" });
  });

  it("explicit fields win over trace-context fields", () => {
    setTraceContextSource(() => ({ trace_id: "auto", span_id: "auto" }));
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("override", { trace_id: "manual" });
    expect(lastLine(spy).trace_id).toBe("manual");
  });

  it("a throwing source never breaks logging", () => {
    setTraceContextSource(() => {
      throw new Error("boom");
    });
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("still.logs");
    expect(lastLine(spy)).toMatchObject({ level: "info", message: "still.logs" });
    expect(lastLine(spy).trace_id).toBeUndefined();
  });

  it("undefined from the source means no trace fields", () => {
    setTraceContextSource(() => undefined);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("no.active.span");
    expect(lastLine(spy).trace_id).toBeUndefined();
  });
});
