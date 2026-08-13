// Reduces the conversation history sent to the model on each request. The
// authoritative current file state lives in the virtual filesystem, so old
// generated code and reasoning tokens in the chat history are redundant and
// inflate prompt tokens / provider usage.

export const COMPACT_HISTORY_MAX_MESSAGES = 12;
export const COMPACTED_MESSAGE_MAX_LEN = 300;

export type ChatMessage = {
  id?: string;
  role: string;
  content?: string | unknown[];
  parts?: any[];
  [key: string]: any;
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
  return stripped.map((msg, i) =>
    msg.role === "assistant" && i < lastIndex ? compactMessage(msg) : msg
  );
}

// Keep the original user goal pinned, then the most recent messages.
export function capHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= COMPACT_HISTORY_MAX_MESSAGES) return messages;
  const firstUserIndex = messages.findIndex((m) => m.role === "user");
  const prefix =
    firstUserIndex >= 0 ? messages.slice(0, firstUserIndex + 1) : [];
  const tailCount = Math.max(COMPACT_HISTORY_MAX_MESSAGES - prefix.length, 1);
  const tail = messages.slice(messages.length - tailCount);
  return [...prefix, ...tail];
}

export function prepareModelMessages(messages: ChatMessage[]): ChatMessage[] {
  return capHistory(compactMessages(messages));
}
