import { describe, test, expect } from "vitest";
import {
  stripReasoningParts,
  compactMessage,
  compactMessages,
  capHistory,
  prepareModelMessages,
  COMPACTED_MESSAGE_MAX_LEN,
  type ChatMessage,
} from "../message-compaction";

const userMsg = (id: string, content: string): ChatMessage => ({
  id,
  role: "user",
  content,
});

const assistantMsg = (id: string, content: string, parts: any[] = []): ChatMessage => ({
  id,
  role: "assistant",
  content,
  ...(parts.length > 0 && { parts }),
});

describe("stripReasoningParts", () => {
  test("removes reasoning parts from a message", () => {
    const msg = assistantMsg("a1", "Done.", [
      { type: "reasoning", reasoning: "Let me think…" },
      { type: "text", text: "Done." },
      { type: "tool-invocation", toolInvocation: { toolName: "x" } },
    ]);
    const result = stripReasoningParts(msg);
    expect(result.parts!.map((p: any) => p.type)).toEqual([
      "text",
      "tool-invocation",
    ]);
  });

  test("returns the message unchanged when there are no reasoning parts", () => {
    const msg = assistantMsg("a1", "Hello");
    expect(stripReasoningParts(msg)).toBe(msg);
  });

  test("leaves string-content messages untouched", () => {
    const msg = userMsg("u1", "Hello");
    expect(stripReasoningParts(msg)).toBe(msg);
  });
});

describe("compactMessage", () => {
  test("collapses tool calls and generated code into a short placeholder", () => {
    const longCode = "const x = " + "a".repeat(COMPACTED_MESSAGE_MAX_LEN + 100);
    const msg = assistantMsg("a1", longCode, [
      { type: "tool-invocation", toolInvocation: { toolName: "str_replace_editor" } },
      { type: "text", text: longCode },
    ]);
    const result = compactMessage(msg);
    expect(result.toolInvocations).toBeUndefined();
    expect(result.content).toHaveLength(COMPACTED_MESSAGE_MAX_LEN + 1);
    expect(String(result.content).endsWith("…")).toBe(true);
    expect(result.parts).toEqual([
      { type: "text", text: result.content },
    ]);
    expect(result.id).toBe("a1");
    expect(result.role).toBe("assistant");
  });

  test("keeps short messages intact", () => {
    const msg = assistantMsg("a1", "Short reply");
    const result = compactMessage(msg);
    expect(result.content).toBe("Short reply");
  });
});

describe("compactMessages", () => {
  test("compacts all assistant messages except the last one", () => {
    const messages = [
      userMsg("u1", "Build a counter"),
      assistantMsg("a1", "Created /App.jsx", [{ type: "tool-invocation", toolInvocation: {} }]),
      userMsg("u2", "Make it blue"),
      assistantMsg("a2", "Done", [{ type: "tool-invocation", toolInvocation: {} }]),
    ];
    const result = compactMessages(messages);
    expect(result[1].role).toBe("assistant");
    expect(result[1].toolInvocations).toBeUndefined();
    expect(result[3]).toBe(messages[3]);
    expect(result[0]).toBe(messages[0]);
    expect(result[2]).toBe(messages[2]);
  });

  test("strips reasoning from every message", () => {
    const messages = [
      assistantMsg("a1", "old", [{ type: "reasoning", reasoning: "thinking…" }]),
      assistantMsg("a2", "new", [{ type: "reasoning", reasoning: "thinking…" }]),
    ];
    const result = compactMessages(messages);
    for (const msg of result) {
      expect(msg.parts!.some((p: any) => p.type === "reasoning")).toBe(false);
    }
  });

  test("returns empty array for empty input", () => {
    expect(compactMessages([])).toEqual([]);
  });

  test("drops tool-result user messages orphaned by compaction", () => {
    const messages = [
      userMsg("u1", "Build a counter"),
      assistantMsg("a1", "Created /App.jsx", [{ type: "tool-invocation", toolInvocation: {} }]),
      // v5-style user message carrying the tool result
      {
        id: "u2",
        role: "user" as const,
        parts: [{ type: "tool-invocation_result", toolInvocation: {} }],
      },
      userMsg("u3", "Make it blue"),
    ];
    const result = compactMessages(messages);
    expect(result.map((m) => m.id)).toEqual(["u1", "a1", "u3"]);
  });

  test("keeps tool results that trail the last message when their call is intact", () => {
    const messages = [
      userMsg("u1", "Build a counter"),
      assistantMsg("a1", "Done", [{ type: "tool-invocation", toolInvocation: {} }]),
      {
        id: "u2",
        role: "user" as const,
        parts: [{ type: "tool-invocation_result", toolInvocation: {} }],
      },
    ];
    const result = compactMessages(messages);
    // a1 sits before lastIndex, so it is compacted and its result is
    // orphaned — both must be reduced to safe text-only history.
    expect(result.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  test("does not touch tool results when no assistant was compacted", () => {
    const messages = [
      userMsg("u1", "Build a counter"),
      assistantMsg("a1", "Done", [{ type: "tool-invocation", toolInvocation: {} }]),
    ];
    const result = compactMessages(messages);
    expect(result.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(result[1].parts).toBe(messages[1].parts);
  });

  test("strips tool results from mixed user messages orphaned by compaction", () => {
    const messages = [
      userMsg("u1", "Build a counter"),
      assistantMsg("a1", "Created /App.jsx", [{ type: "tool-invocation", toolInvocation: {} }]),
      {
        id: "u2",
        role: "user" as const,
        parts: [{ type: "tool-invocation_result" }, { type: "text", text: "and make it blue" }],
      },
    ];
    const result = compactMessages(messages);
    expect(result).toHaveLength(3);
    expect(result[2].parts).toEqual([{ type: "text", text: "and make it blue" }]);
  });
});

describe("capHistory", () => {
  const manyMessages = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? userMsg(`u${i}`, `question ${i}`) : assistantMsg(`a${i}`, `answer ${i}`)
  );

  test("keeps the first user message and the most recent messages", () => {
    const result = capHistory(manyMessages);
    expect(result.length).toBe(12);
    expect(result[0]).toBe(manyMessages[0]);
    expect(result[result.length - 1]).toBe(manyMessages[manyMessages.length - 1]);
  });

  test("returns the array unchanged when under the cap", () => {
    const small = manyMessages.slice(0, 5);
    expect(capHistory(small)).toBe(small);
  });

  test("drops trailing assistant messages from the pinned prefix if needed", () => {
    const firstUserIndex = manyMessages.findIndex((m) => m.role === "user");
    const prefix = manyMessages.slice(0, firstUserIndex + 1);
    expect(prefix).toEqual([manyMessages[0]]);
  });

  test("drops leading tool-result messages sliced mid-step from the tail", () => {
    const messages = [
      userMsg("u0", "Build a counter"),
      assistantMsg("a1", "ok", [{ type: "tool-invocation", toolInvocation: { state: "call" } }]),
      { id: "u1", role: "user" as const, parts: [{ type: "tool-invocation_result" }] },
      ...Array.from({ length: 10 }, (_, i) => userMsg(`f${i}`, `filler ${i}`)),
    ];
    // 13 messages total, cap 12, pinned prefix = 1 → tail = indices 2..?
    const result = capHistory(messages);
    const ids = result.map((m) => m.id);
    expect(ids).toContain("u0");
    expect(ids).not.toContain("u1"); // orphaned tool result at the tail start
    expect(ids).not.toContain("a1");
  });
});

describe("prepareModelMessages", () => {
  test("combines compaction, reasoning stripping, and history capping", () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0
        ? userMsg(`u${i}`, `question ${i}`)
        : assistantMsg(`a${i}`, `answer ${i}`, [
            { type: "reasoning", reasoning: "thinking…" },
            { type: "tool-invocation", toolInvocation: { toolName: "x" } },
          ])
    );
    const result = prepareModelMessages(messages);
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result[0]).toBe(messages[0]);
    expect(result[result.length - 1].id).toBe(messages[messages.length - 1].id);
    expect(result[result.length - 1].content).toBe(
      messages[messages.length - 1].content
    );
    for (const msg of result) {
      if (msg.role === "assistant") {
        expect(msg.parts!.some((p: any) => p.type === "reasoning")).toBe(false);
      }
    }
  });
});
