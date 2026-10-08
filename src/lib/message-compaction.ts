// Reduces the conversation history sent to the model on each request. The
// authoritative current file state lives in the virtual filesystem, so old
// generated code and reasoning tokens in the chat history are redundant and
// inflate prompt tokens / provider usage.

import {
  COMPACT_HISTORY_MAX_MESSAGES,
  COMPACTED_MESSAGE_MAX_LEN,
} from "@/lib/constants";

// Re-export for backward compatibility with existing imports
export { COMPACT_HISTORY_MAX_MESSAGES, COMPACTED_MESSAGE_MAX_LEN };

export type ChatPart = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type ChatMessage = {
  id?: string;
  role: "system" | "user" | "assistant";
  content?: string | ChatPart[];
  parts?: ChatPart[];
  // Legacy ai v4 field: tool calls/results attached directly to messages
  toolInvocations?: unknown[];
  [key: string]: unknown;
};

export function getMessageText(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("\n");
  }
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("\n");
  }
  return "";
}

// Drop reasoning/thinking parts before resubmitting history so thinking
// tokens are not re-billed as input context.
export function stripReasoningParts(msg: ChatMessage): ChatMessage {
  if (!Array.isArray(msg.parts)) return msg;
  const filtered = msg.parts.filter((p: any) => p?.type !== "reasoning");
  if (filtered.length === msg.parts.length) return msg;
  return { ...msg, parts: filtered };
}

// Collapse a completed assistant turn into a short text placeholder. Tool
// calls, tool results, and generated code are removed; the authoritative
// current file state is delivered separately via the filesystem cache.
export function compactMessage(msg: ChatMessage): ChatMessage {
  const text = getMessageText(msg);
  const trimmed = text.slice(0, COMPACTED_MESSAGE_MAX_LEN);
  const summary = trimmed.length < text.length ? `${trimmed}…` : trimmed;
  return {
    id: msg.id,
    role: msg.role,
    content: summary,
    parts: [{ type: "text", text: summary }],
  };
}

export function compactMessages(messages: ChatMessage[]): ChatMessage[] {
  const stripped = messages.map(stripReasoningParts);
  if (stripped.length === 0) return stripped;
  const lastIndex = stripped.length - 1;

  const isToolPart = (p: unknown): boolean => {
    const type = (p as ChatPart | null)?.type;
    return typeof type === "string" && (type === "tool" || type.startsWith("tool-"));
  };

  const result: ChatMessage[] = [];
  // Once an assistant message has been compacted (its tool-call parts removed),
  // tool-result parts on later user-role messages become orphans that providers
  // reject with a 400. Drop them until the next uncompacted assistant message.
  let orphanToolResults = false;

  for (let i = 0; i < stripped.length; i++) {
    const msg = stripped[i];

    if (msg.role === "assistant") {
      orphanToolResults = i < lastIndex;
      result.push(orphanToolResults ? compactMessage(msg) : msg);
      continue;
    }

    if (orphanToolResults) {
      // Legacy v4 shape: tool results attached directly to the message.
      if (Array.isArray(msg.toolInvocations)) {
        const hasText = Boolean(getMessageText(msg));
        const hasParts = Array.isArray(msg.parts) && msg.parts.length > 0;
        if (!hasText && !hasParts) continue; // tool results only — drop
        result.push({ ...msg, toolInvocations: undefined });
        continue;
      }

      const seq = Array.isArray(msg.parts)
        ? msg.parts
        : Array.isArray(msg.content)
          ? msg.content
          : null;

      if (seq && seq.some(isToolPart)) {
        const kept = seq.filter((p) => !isToolPart(p));
        if (kept.length === 0) continue; // message was only tool results
        result.push(
          Array.isArray(msg.content)
            ? { ...msg, content: kept }
            : { ...msg, parts: kept }
        );
        continue;
      }
    }

    result.push(msg);
  }

  return result;
}

export function isToolResultOnly(msg: ChatMessage): boolean {
  const isToolPart = (p: unknown): boolean => {
    const type = (p as ChatPart | null)?.type;
    return typeof type === "string" && (type === "tool" || type.startsWith("tool-"));
  };
  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    return msg.parts.every(isToolPart);
  }
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    return msg.content.every(isToolPart);
  }
  if (Array.isArray(msg.toolInvocations) && msg.toolInvocations.length > 0) {
    return !getMessageText(msg);
  }
  return false;
}

// Keep the original user goal pinned, then the most recent messages.
export function capHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= COMPACT_HISTORY_MAX_MESSAGES) return messages;
  const firstUserIndex = messages.findIndex((m) => m.role === "user");
  const prefix =
    firstUserIndex >= 0 ? messages.slice(0, firstUserIndex + 1) : [];
  const tailCount = Math.max(COMPACT_HISTORY_MAX_MESSAGES - prefix.length, 1);
  const tail = messages.slice(messages.length - tailCount);
  // The tail may start mid-step (tool results whose tool-call was sliced
  // away) — drop leading orphan tool results so providers don't 400.
  let start = 0;
  while (start < tail.length && isToolResultOnly(tail[start])) start++;
  return [...prefix, ...tail.slice(start)];
}

export function prepareModelMessages(messages: ChatMessage[]): ChatMessage[] {
  return capHistory(compactMessages(messages));
}
