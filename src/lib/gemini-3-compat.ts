import { supportsThinkingBudget } from "./models";

// Compatibility bridge for Gemini 3.x models with the pinned @ai-sdk/google
// (1.2.x), which predates Gemini 3:
//
// 1. Thinking level. The SDK's zod schema strips `thinkingLevel` from
//    providerOptions, but Gemini 3.x models are configured with thinking
//    levels and can never disable thinking. Left alone, their default
//    (medium) thinking consumes the entire maxTokens budget before the first
//    tool call (observed: finishReason "length", 0 tool calls, ~38s on the
//    free tier). This wrapper injects generationConfig.thinkingConfig.
//    thinkingLevel "minimal" into outgoing requests.
//
// 2. Thought signatures. Gemini 3.x returns an opaque `thoughtSignature`
//    alongside function calls and rejects follow-up requests whose history
//    contains functionCall parts without one (400 "Function call is missing
//    a thought_signature"). The SDK strips signatures when parsing parts and
//    never echoes them back, so multi-step tool flows die on step 2. The
//    wrapper captures signatures from streamed responses and injects the
//    latest one into outgoing functionCall parts that lack a signature.
//    The map is global, so concurrent requests can theoretically exchange
//    signatures — the API treats a mismatched signature as degraded
//    performance, only a MISSING one is a hard 400. This is a bridge until
//    an SDK that natively supports Gemini 3 (ai v5) lands.

const MINIMAL_THINKING_LEVEL = "minimal";

// Keyed by function name; Gemini only hard-fails on missing signatures, so
// the latest observed signature per tool is good enough for a bridge.
const signatureByTool = new Map<string, string>();

function geminiModelIdFromUrl(url: string): string | undefined {
  return /\/models\/([\w.-]+):(streamGenerateContent|generateContent)/.exec(url)?.[1];
}

function injectThoughtSignatures(body: { contents?: unknown }): void {
  for (const content of Array.isArray(body.contents) ? body.contents : []) {
    const parts = (content as { parts?: unknown })?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const call = (part as { functionCall?: { name?: unknown } })?.functionCall;
      if (!call || typeof call.name !== "string") continue;
      if ((part as { thoughtSignature?: unknown }).thoughtSignature) continue;
      const signature = signatureByTool.get(call.name) ?? lastSignature;
      if (signature) {
        (part as { thoughtSignature?: string }).thoughtSignature = signature;
      }
    }
  }
}

interface GeminiChunkPart {
  functionCall?: { name?: unknown };
  thoughtSignature?: unknown;
  thought?: unknown;
  text?: unknown;
}

function harvestSignaturesFromSseChunk(chunk: string): void {
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as {
        candidates?: { content?: { parts?: GeminiChunkPart[] } }[];
      };
      for (const part of parsed.candidates?.[0]?.content?.parts ?? []) {
        if (typeof part.thoughtSignature === "string" && part.thoughtSignature) {
          const name = part.functionCall?.name;
          if (typeof name === "string") {
            signatureByTool.set(name, part.thoughtSignature);
          } else {
            // A signature on a non-functionCall part (e.g. the end of a
            // thinking block) — remember it as the fallback for the next
            // bare functionCall in this stream.
            lastSignature = part.thoughtSignature;
          }
        }
        if (part.functionCall?.name && typeof part.functionCall.name === "string") {
          const name = part.functionCall.name;
          if (!signatureByTool.has(name) && lastSignature) {
            signatureByTool.set(name, lastSignature);
          }
        }
      }
    } catch {
      // Not JSON — ignore; signature harvesting is best-effort.
    }
  }
}

let lastSignature: string | undefined;

async function consumeForSignatures(stream: ReadableStream<Uint8Array>): Promise<void> {
  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lastNewline = buffer.lastIndexOf("\n");
      if (lastNewline === -1) continue;
      harvestSignaturesFromSseChunk(buffer.slice(0, lastNewline + 1));
      buffer = buffer.slice(lastNewline + 1);
    }
    harvestSignaturesFromSseChunk(buffer);
  } catch {
    // Best-effort harvesting — never break the caller's stream.
  }
}

export function createGemini3CompatFetch(): typeof fetch {
  return async (input, init) => {
    // Resolved lazily so patches applied after module evaluation (e.g.
    // instrumentation wrappers) are still honored.
    const rawFetch = globalThis.fetch;
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const modelId = url ? geminiModelIdFromUrl(url) : undefined;

    // Gemini 2.5 models need no bridging: they take thinkingBudget via
    // providerOptions and don't use thought signatures.
    if (!modelId || supportsThinkingBudget(modelId)) {
      return rawFetch(input, init);
    }

    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as {
          contents?: unknown;
          generationConfig?: Record<string, unknown>;
        };
        injectThoughtSignatures(body);
        body.generationConfig = {
          ...body.generationConfig,
          thinkingConfig: { thinkingLevel: MINIMAL_THINKING_LEVEL },
        };
        init = { ...init, body: JSON.stringify(body) };
      } catch {
        // Not valid JSON (unexpected) — pass the request through untouched.
        return rawFetch(input, init);
      }
    }

    const response = await rawFetch(input, init);

    // Tee the stream so signatures can be harvested without slowing or
    // breaking the caller's branch.
    if (response.body && url.includes(":streamGenerateContent")) {
      const [callerBranch, harvesterBranch] = response.body.tee();
      void consumeForSignatures(harvesterBranch);
      return new Response(callerBranch, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  };
}
