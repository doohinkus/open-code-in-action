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
