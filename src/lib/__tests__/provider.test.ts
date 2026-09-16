import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  getLanguageModel,
  buildLanguageModel,
  buildGroqModel,
  groqMaxTokens,
  MockLanguageModel,
  createRateLimitFallbackModel,
  resetProviderInstanceCache,
  isRateLimitError,
  isRetryableUpstreamError,
  isDeadModelError,
} from "@/lib/provider";
import { MAX_TOKENS_GROQ_DEFAULT } from "@/lib/constants";
import { DEFAULT_MODEL, DEFAULT_GROQ_MODEL } from "@/lib/models";

import type {
  LanguageModelV1,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";

const ORIGINAL_ENV = { ...process.env };

function clearProviderEnv() {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("OPENAI_COMPATIBLE_") ||
      key.startsWith("GOOGLE_") ||
      key.startsWith("GEMINI_") ||
      key.startsWith("GROQ_") ||
      key === "MAX_TOKENS_GROQ" ||
      key === "ANTHROPIC_API_KEY" ||
      key === "FORCE_MOCK_PROVIDER"
    ) {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  clearProviderEnv();
  resetProviderInstanceCache();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getLanguageModel", () => {
  test("returns the mock provider when forced, ignoring overrides", () => {
    process.env.FORCE_MOCK_PROVIDER = "1";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel(DEFAULT_MODEL);
    expect(model).toBeInstanceOf(MockLanguageModel);
    expect(model.modelId).toBe("mock-" + DEFAULT_MODEL);
  });

  test("returns the mock provider when no provider is configured", () => {
    const model = getLanguageModel(DEFAULT_MODEL);
    expect(model).toBeInstanceOf(MockLanguageModel);
    expect(model.modelId).toBe("mock-" + DEFAULT_MODEL);
  });

  test("ignores a GOOGLE_API_KEY", () => {
    process.env.GOOGLE_API_KEY = "sk-test";
    const model = getLanguageModel();
    expect(model).toBeInstanceOf(MockLanguageModel);
  });

  test("ignores an ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const model = getLanguageModel();
    expect(model).toBeInstanceOf(MockLanguageModel);
  });
});

describe("getLanguageModel (Gemini)", () => {
  test("builds a Google model when a Gemini key is configured", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel();
    expect(model.modelId).toBe(DEFAULT_MODEL);
    expect(model.provider).toBe("google.generative-ai");
  });

  test("serves the requested Gemini model", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel("gemini-3.5-flash-lite");
    expect(model.modelId).toBe("gemini-3.5-flash-lite");
    expect(model.provider).toBe("google.generative-ai");
  });

  test("trims whitespace around the requested model id", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel("  gemini-3.5-flash-lite  ");
    expect(model.modelId).toBe("gemini-3.5-flash-lite");
  });

  test("falls back to the default model for an empty override", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel("   ");
    expect(model.modelId).toBe(DEFAULT_MODEL);
  });

  test("uses GEMINI_MODEL as the default Gemini model", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";

    const model = getLanguageModel();
    expect(model.modelId).toBe("gemini-3.5-flash-lite");
  });

  test("falls back when GEMINI_MODEL is not a free Gemini model", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";
    process.env.GEMINI_MODEL = "gemini-2.5-pro";

    const model = getLanguageModel();
    expect(model.modelId).toBe(DEFAULT_MODEL);
  });

  test("falls back to the env default when the requested id is not free", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";

    const model = getLanguageModel("gpt-5.4-mini");
    expect(model.modelId).toBe("gemini-3.5-flash-lite");
  });

  test("serves the Gemini default when a non-Gemini id is requested", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel("big-pickle");
    expect(model.modelId).toBe(DEFAULT_MODEL);
    expect(model.provider).toBe("google.generative-ai");
  });
});

describe("getLanguageModel (Groq)", () => {
  test("serves the Groq default when only GROQ_API_KEY is configured", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const model = getLanguageModel();
    expect(model.modelId).toBe(DEFAULT_GROQ_MODEL);
    expect(model.provider).toBe("groq.chat");
  });

  test("serves the requested Groq model when Groq is configured", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const model = getLanguageModel("openai/gpt-oss-20b");
    expect(model.modelId).toBe("openai/gpt-oss-20b");
    expect(model.provider).toBe("groq.chat");
  });

  test("preferred provider is Gemini when both keys are set and nothing requested", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";
    process.env.GROQ_API_KEY = "gsk-test";

    const model = getLanguageModel();
    expect(model.modelId).toBe(DEFAULT_MODEL);
    expect(model.provider).toBe("google.generative-ai");
  });

  test("falls back to the Gemini default when a Groq id is requested without a Groq key", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = getLanguageModel("openai/gpt-oss-120b");
    expect(model.modelId).toBe(DEFAULT_MODEL);
    expect(model.provider).toBe("google.generative-ai");
  });

  test("serves a Groq id when Gemini is unconfigured, even with both being keys", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const model = getLanguageModel("openai/gpt-oss-20b");
    expect(model.modelId).toBe("openai/gpt-oss-20b");
    expect(model.provider).toBe("groq.chat");
  });
});

describe("buildGroqModel", () => {
  test("throws when GROQ_API_KEY is missing", () => {
    expect(() => buildGroqModel("openai/gpt-oss-120b")).toThrow("GROQ_API_KEY");
  });

  test("builds a cached OpenAI-compatible model", () => {
    process.env.GROQ_API_KEY = "gsk-test";

    const a = buildGroqModel("openai/gpt-oss-120b");
    const b = buildGroqModel("openai/gpt-oss-120b");
    expect(b).toBe(a);
    expect(a.provider).toBe("groq.chat");
    expect(a.modelId).toBe("openai/gpt-oss-120b");
    expect(a.specificationVersion).toBe("v1");
  });
});

describe("groqMaxTokens", () => {
  test("defaults to the Groq cap when MAX_TOKENS_GROQ is unset", () => {
    expect(groqMaxTokens()).toBeGreaterThan(0);
  });

  test("honors a positive MAX_TOKENS_GROQ override", () => {
    process.env.MAX_TOKENS_GROQ = "12000";
    expect(groqMaxTokens()).toBe(12000);
  });

  test("ignores invalid overrides", () => {
    process.env.MAX_TOKENS_GROQ = "not-a-number";
    expect(groqMaxTokens()).toBe(MAX_TOKENS_GROQ_DEFAULT);
  });
});

describe("isRateLimitError", () => {
  test("matches rate-limit messages", () => {
    expect(isRateLimitError(new Error("Rate limit exceeded. Please try again later."))).toBe(true);
    expect(isRateLimitError(new Error("http status code 429"))).toBe(true);
    expect(isRateLimitError(new Error("insufficient_quota"))).toBe(true);
    expect(isRateLimitError({ message: "Too many requests" })).toBe(true);
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
  });

  test("ignores non-rate-limit errors", () => {
    expect(isRateLimitError(new Error("Internal server error"))).toBe(false);
    expect(isRateLimitError({ statusCode: 500, message: "boom" })).toBe(false);
    expect(isRateLimitError("just a string")).toBe(false);
  });

  test("matches rate limits nested in plain provider error objects", () => {
    expect(
      isRateLimitError({ error: "Rate limit exceeded. Please try again later." })
    ).toBe(true);
    expect(isRateLimitError({ error: { message: "insufficient_quota" } })).toBe(true);
  });
});

describe("isDeadModelError", () => {
  test("matches the ModelError retired-model error shape", () => {
    // Plain-object shape with a nested ModelError type, as some providers
    // return for removed models.
    expect(
      isDeadModelError({
        error: { type: "ModelError", message: "Model hy3-free is not supported" },
      })
    ).toBe(true);
    expect(isDeadModelError(new Error("Model hy3-free is not supported"))).toBe(true);
  });

  test("matches other model-missing wordings", () => {
    expect(isDeadModelError(new Error("The model `foo-bar` does not exist"))).toBe(true);
    expect(isDeadModelError({ error: "unknown model: nope-free" })).toBe(true);
    expect(isDeadModelError(new Error("invalid model id: mystery-model"))).toBe(true);
  });

  test("matches Google's 404 not-found error", () => {
    expect(
      isDeadModelError(
        new Error("models/gemini-2.5-flash is not found for API version v1beta")
      )
    ).toBe(true);
    expect(
      isDeadModelError({
        error: {
          code: 404,
          message: "models/gemini-2.5-pro is not found for API version v1beta",
          status: "NOT_FOUND",
        },
      })
    ).toBe(true);
  });

  test("ignores credential failures and unrelated errors", () => {
    expect(
      isDeadModelError(Object.assign(new Error("Invalid API key"), { statusCode: 401 }))
    ).toBe(false);
    expect(isDeadModelError(new Error("Internal server error"))).toBe(false);
    expect(isDeadModelError({ statusCode: 404, message: "Not Found" })).toBe(false);
  });

  test("is treated as retryable by isRetryableUpstreamError", () => {
    expect(isRetryableUpstreamError(new Error("Model hy3-free is not supported"))).toBe(true);
    expect(
      isRetryableUpstreamError({
        error: { type: "ModelError", message: "Model x is not supported" },
      })
    ).toBe(true);
    // A plain credentials 401 must still propagate immediately.
    expect(
      isRetryableUpstreamError(Object.assign(new Error("Invalid API key"), { statusCode: 401 }))
    ).toBe(false);
  });
});

describe("isRetryableUpstreamError", () => {
  test("matches the plain 504 idle-timeout provider object", () => {
    const error = {
      error: "Streaming response failed: [504] Upstream idle timeout exceeded",
    };
    expect(isRetryableUpstreamError(error)).toBe(true);
  });

  test("treats a Gemini 3 thought-signature rejection as retryable", () => {
    // Cross-provider history (e.g. Groq-built functionCall parts) can trip
    // Google's signature validation with a hard 400. The chain must rotate
    // past it instead of failing the whole turn.
    expect(
      isRetryableUpstreamError(
        new Error(
          "Function call is missing a thought_signature in functionCall parts."
        )
      )
    ).toBe(true);
    expect(
      isRetryableUpstreamError({
        statusCode: 400,
        message:
          '400 "Function call is missing a thought_signature in functionCall parts."',
      })
    ).toBe(true);
  });

  test("matches nested 5xx provider error objects", () => {
    expect(isRetryableUpstreamError({ error: { type: "server_error" } })).toBe(true);
    expect(isRetryableUpstreamError({ statusCode: 503 })).toBe(true);
  });

  test("ignores unrelated provider objects", () => {
    expect(isRetryableUpstreamError({ error: "Invalid API key" })).toBe(false);
    expect(isRetryableUpstreamError({ error: "content_filter" })).toBe(false);
  });
});

// --- helpers to build minimal fake models for the fallback wrapper tests ---

function fakeGenerateModel(handler: (options: any) => any): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "test-provider",
    modelId: "test-model",
    async doGenerate(options: any) {
      return handler(options);
    },
    async doStream() {
      throw new Error("doStream not implemented");
    },
  } as unknown as LanguageModelV1;
}

function fakeStreamModel(parts: LanguageModelV1StreamPart[], error?: unknown): LanguageModelV1 {
  return {
    specificationVersion: "v1",
    provider: "test-provider",
    modelId: "test-model",
    async doGenerate() {
      throw new Error("doGenerate not implemented");
    },
    async doStream() {
      const stream = new ReadableStream<LanguageModelV1StreamPart>({
        async start(controller) {
          for (const part of parts) controller.enqueue(part);
          if (error) controller.error(error);
          else controller.close();
        },
      });
      return {
        stream,
        warnings: [],
        rawCall: { rawPrompt: [], rawSettings: {} },
        rawResponse: { headers: {} },
      };
    },
  } as unknown as LanguageModelV1;
}

async function collectStreamParts(model: LanguageModelV1): Promise<LanguageModelV1StreamPart[]> {
  const result = await model.doStream({ prompt: [], mode: { type: "regular" } } as any);
  const reader = result.stream.getReader();
  const parts: LanguageModelV1StreamPart[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

describe("createRateLimitFallbackModel", () => {
  const GENERATE_OPTIONS = {
    prompt: [{ role: "user" as const, content: "hi" }],
    mode: { type: "regular" as const },
  };

  test("returns the mock primary unchanged", () => {
    const mock = new MockLanguageModel("mock-x");
    expect(createRateLimitFallbackModel(mock, [mock])).toBe(mock);
  });

  test("applies a per-member maxTokens override to fallback calls", async () => {
    const seen: Record<string, unknown>[] = [];
    const primary = fakeGenerateModel((options) => {
      seen.push(options);
      throw new Error("Rate limit exceeded. Please try again later.");
    });
    const fallback = fakeGenerateModel((options) => {
      seen.push(options);
      return {
        text: "fallback output",
        toolCalls: [],
        finishReason: "stop" as const,
        usage: { promptTokens: 1, completionTokens: 1 },
        warnings: [],
        rawCall: { rawPrompt: [], rawSettings: {} },
      };
    });

    // The request-level cap belongs to the primary provider; the Groq-class
    // fallback member overrides it with its own cap.
    const wrapped = createRateLimitFallbackModel(primary, [
      { model: fallback, maxTokens: 8192 },
    ]);
    await wrapped.doGenerate({ ...GENERATE_OPTIONS, maxTokens: 24000 } as any);
    expect(seen.length).toBe(2);
    expect(seen[0].maxTokens).toBe(24000);
    expect(seen[1].maxTokens).toBe(8192);
  });

  test("members without a maxTokens override keep the request-level cap", async () => {
    const seen: Record<string, unknown>[] = [];
    const primary = fakeGenerateModel((options) => {
      seen.push(options);
      throw new Error("Rate limit exceeded. Please try again later.");
    });
    const fallback = fakeGenerateModel((options) => {
      seen.push(options);
      return {
        text: "fallback output",
        toolCalls: [],
        finishReason: "stop" as const,
        usage: { promptTokens: 1, completionTokens: 1 },
        warnings: [],
        rawCall: { rawPrompt: [], rawSettings: {} },
      };
    });

    const wrapped = createRateLimitFallbackModel(primary, [{ model: fallback }]);
    await wrapped.doGenerate({ ...GENERATE_OPTIONS, maxTokens: 24000 } as any);
    expect(seen[0].maxTokens).toBe(24000);
    expect(seen[1].maxTokens).toBe(24000);
  });

  test("doGenerate returns the fallback result on a rate-limit error", async () => {
    const primary = fakeGenerateModel(() => {
      throw new Error("Rate limit exceeded. Please try again later.");
    });
    const fallback = fakeGenerateModel(() => ({
      text: "fallback output",
      toolCalls: [],
      finishReason: "stop" as const,
      usage: { promptTokens: 1, completionTokens: 1 },
      warnings: [],
      rawCall: { rawPrompt: [], rawSettings: {} },
    }));

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("fallback output");
  });

  test("rotates through fallbacks until one succeeds", async () => {
    const rateLimited = () => {
      throw new Error("Rate limit exceeded. Please try again later.");
    };
    const primary = fakeGenerateModel(rateLimited);
    const second = fakeGenerateModel(rateLimited);
    const third = fakeGenerateModel(() => ({
      text: "third model output",
      toolCalls: [],
      finishReason: "stop" as const,
      usage: { promptTokens: 1, completionTokens: 1 },
      warnings: [],
      rawCall: { rawPrompt: [], rawSettings: {} },
    }));

    const wrapped = createRateLimitFallbackModel(primary, [second, third]);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("third model output");
  });

  test("rejects when every model in the chain is rate-limited", async () => {
    const primary = fakeGenerateModel(() => {
      throw new Error("Rate limit exceeded. Please try again later.");
    });
    const second = fakeGenerateModel(() => {
      throw new Error("http status code 429");
    });

    const wrapped = createRateLimitFallbackModel(primary, [second]);
    await expect(wrapped.doGenerate(GENERATE_OPTIONS as any)).rejects.toThrow(
      "http status code 429"
    );
  });

  test("doGenerate returns the primary result on success", async () => {
    const primary = fakeGenerateModel(() => ({
      text: "primary output",
      toolCalls: [],
      finishReason: "stop" as const,
      usage: { promptTokens: 1, completionTokens: 1 },
      warnings: [],
      rawCall: { rawPrompt: [], rawSettings: {} },
    }));
    const fallback = fakeGenerateModel(() => {
      throw new Error("fallback should not be called");
    });

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("primary output");
  });

  test("doGenerate rethrows non-rate-limit errors", async () => {
    const primary = fakeGenerateModel(() => {
      throw new Error("Bad gateway");
    });
    const fallback = fakeGenerateModel(() => ({ text: "fallback" }));

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    await expect(wrapped.doGenerate(GENERATE_OPTIONS as any)).rejects.toThrow("Bad gateway");
  });

  test("doStream falls back when doStream() itself rejects with a rate limit (real 429 shape)", async () => {
    const primary = {
      specificationVersion: "v1",
      provider: "test-provider",
      modelId: "test-model",
      async doGenerate() {
        throw new Error("doGenerate not implemented");
      },
      async doStream() {
        throw new Error("Rate limit exceeded. Please try again later.");
      },
    } as unknown as LanguageModelV1;
    const fallback = fakeStreamModel([
      { type: "text-delta", textDelta: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "ok" });
  });

  test("doGenerate rotates past a transient 503 upstream failure", async () => {
    const primary = fakeGenerateModel(() => {
      throw Object.assign(new Error("Endpoint is unavailable."), { statusCode: 503 });
    });
    const fallback = fakeGenerateModel(() => ({ text: "recovered" }));

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("recovered");
  });

  test("doGenerate rotates past a retired (not supported) model", async () => {
    // A 401 "Model X is not supported" means the model is gone upstream; the
    // chain must skip it rather than fail the turn.
    const primary = fakeGenerateModel(() => {
      throw Object.assign(new Error("Model hy3-free is not supported"), { statusCode: 401 });
    });
    const fallback = fakeGenerateModel(() => ({ text: "recovered" }));

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("recovered");
  });

  test("doStream rotates past a retired (not supported) model error part", async () => {
    const primary = fakeStreamModel([
      {
        type: "error",
        error: { error: { type: "ModelError", message: "Model hy3-free is not supported" } },
      },
    ]);
    const fallback = fakeStreamModel([
      { type: "text-delta", textDelta: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
  });

  test("doGenerate propagates non-retryable upstream errors", async () => {
    const primary = fakeGenerateModel(() => {
      throw Object.assign(new Error("Invalid API key"), { statusCode: 401 });
    });
    const fallback = fakeGenerateModel(() => ({ text: "should not run" }));

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    await expect(wrapped.doGenerate(GENERATE_OPTIONS as any)).rejects.toThrow("Invalid API key");
  });

  test("doStream rotates past a transient 503 when doStream() rejects", async () => {
    const primary = {
      specificationVersion: "v1",
      provider: "test-provider",
      modelId: "test-model",
      async doGenerate() {
        throw new Error("doGenerate not implemented");
      },
      async doStream() {
        throw Object.assign(new Error("Endpoint is unavailable."), { statusCode: 503 });
      },
    } as unknown as LanguageModelV1;
    const fallback = fakeStreamModel([
      { type: "text-delta", textDelta: "recovered" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "recovered" });
  });

  test("doStream rotates through models that reject with rate limits", async () => {
    const primary = fakeStreamModel([], new Error("Rate limit exceeded"));
    const second = fakeStreamModel([], new Error("429 Too Many Requests"));
    const third = fakeStreamModel([
      { type: "text-delta", textDelta: "third" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [second, third]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "third" });
  });

  test("doStream falls back when the stream rejects with a rate limit before content", async () => {
    const primary = fakeStreamModel([], new Error("Rate limit exceeded"));
    const fallback = fakeStreamModel([
      { type: "text-delta", textDelta: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "ok" });
  });

  test("doStream falls back when an error part arrives before content with a rate limit", async () => {
    const primary = fakeStreamModel([
      { type: "error", error: new Error("Rate limit exceeded") },
    ]);
    const fallback = fakeStreamModel([{ type: "text-delta", textDelta: "ok" }]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts).toEqual([{ type: "text-delta", textDelta: "ok" }]);
  });

  test("doStream rotates past a retryable error even after plain text", async () => {
    // Text alone doesn't mutate the VFS, so a mid-stream 504 after a text
    // lead-in can still rotate to the next model.
    const primary = fakeStreamModel([
      { type: "text-delta", textDelta: "Let me create that" },
      { type: "error", error: new Error("Rate limit exceeded") },
    ]);
    const fallback = fakeStreamModel([
      { type: "text-delta", textDelta: "recovered" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "text-delta", "finish"]);
  });

  test("doStream keeps the primary stream once a tool call has started", async () => {
    const primary = fakeStreamModel([
      { type: "tool-call", toolCallType: "function", toolCallId: "c1", toolName: "x", args: "{}" },
      { type: "error", error: new Error("Rate limit exceeded") },
    ]);
    const fallback = fakeStreamModel([{ type: "text-delta", textDelta: "should not appear" }]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["tool-call", "error"]);
  });

  test("doStream rotates past a plain-object 504 that arrives mid-reasoning", async () => {
    // The upstream idle timeout surfaces as { error: "Streaming response
    // failed: [504] Upstream idle timeout exceeded" } — a plain object, not
    // an Error. Reasoning deltas alone must not commit the stream to the model.
    const primary = fakeStreamModel([
      { type: "reasoning", textDelta: "The user wants a 3D game..." },
      { type: "error", error: { error: "Streaming response failed: [504] Upstream idle timeout exceeded" } },
    ]);
    const fallback = fakeStreamModel([
      { type: "reasoning", textDelta: "new plan " },
      { type: "text-delta", textDelta: "recovered" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual([
      "reasoning",
      "reasoning",
      "text-delta",
      "finish",
    ]);
    expect(parts[3]).toEqual({
      type: "finish",
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1 },
    });
  });

  test("doStream rotates past a plain-object 504 that arrives after text", async () => {
    const primary = fakeStreamModel([
      { type: "text-delta", textDelta: "here is content" },
      { type: "error", error: { error: "Streaming response failed: [504] Upstream idle timeout exceeded" } },
    ]);
    const fallback = fakeStreamModel([
      { type: "text-delta", textDelta: "recovered" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [fallback]);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "text-delta", "finish"]);
    expect((parts[2] as { finishReason?: string }).finishReason).toBe("stop");
  });

  test("doStream propagates non-rate-limit stream errors", async () => {
    const primary = fakeStreamModel([], new Error("Bad gateway"));
    const wrapped = createRateLimitFallbackModel(primary, [fakeStreamModel([])]);

    await expect(collectStreamParts(wrapped)).rejects.toThrow("Bad gateway");
  });

  test("skips previously-failed models on later streamText steps", async () => {
    // streamText calls doStream once per step with the same wrapper. Once a
    // free model fails with a retryable error, later steps must skip it and
    // start from a working model (the mock) instead of re-trying it.
    const callCounts: Record<string, number> = { p: 0, s: 0, t: 0 };

    function failingModel(label: string): LanguageModelV1 {
      return {
        specificationVersion: "v1",
        provider: "p",
        modelId: label,
        async doGenerate() {
          throw new Error("n/a");
        },
        async doStream() {
          callCounts[label]++;
          const stream = new ReadableStream<LanguageModelV1StreamPart>({
            async start(controller) {
              controller.enqueue({
                type: "error",
                error: {
                  error: "Streaming response failed: [504] Upstream idle timeout exceeded",
                },
              });
            },
          });
          return {
            stream,
            warnings: [],
            rawCall: { rawPrompt: [], rawSettings: {} },
            rawResponse: { headers: {} },
          };
        },
      } as unknown as LanguageModelV1;
    }

    const primary = failingModel("p");
    const second = failingModel("s");
    const third = failingModel("t");
    const mock = fakeStreamModel([
      { type: "text-delta", textDelta: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ]);

    const wrapped = createRateLimitFallbackModel(primary, [second, third, mock]);

    // Step 1: rotates through all three failed models and lands on the mock.
    const firstParts = await collectStreamParts(wrapped);
    expect(firstParts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(callCounts).toEqual({ p: 1, s: 1, t: 1 });

    // Step 2: must NOT re-try the failed models — start straight at the mock.
    const secondParts = await collectStreamParts(wrapped);
    expect(secondParts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(callCounts).toEqual({ p: 1, s: 1, t: 1 });
  });
});

describe("buildLanguageModel", () => {
  test("returns a wrapped Google model when Gemini is configured", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = buildLanguageModel();
    expect(model.provider).toBe("google.generative-ai");
    expect(model.modelId).toBe(DEFAULT_MODEL);
  });

  test("returns a wrapped Google model for a requested 3.5 model", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "ai-test";

    const model = buildLanguageModel("gemini-3.5-flash");
    expect(model.provider).toBe("google.generative-ai");
    expect(model.modelId).toBe("gemini-3.5-flash");
  });

  test("returns the mock provider when no provider is configured", () => {
    const model = buildLanguageModel();
    expect(model.provider).toBe("mock");
    expect(model.modelId).toBe("mock-" + DEFAULT_MODEL);
  });
});

describe("MockLanguageModel fallback message mode", () => {
  test("streams the limitation message and creates a message App.jsx", async () => {
    const mock = new MockLanguageModel("mock-fallback", true);

    const parts = await collectStreamParts(mock);
    const types = parts.map((p) => p.type);
    // The mock streams the message one character at a time, so many
    // text-deltas, then the tool call and finish.
    expect(types[types.length - 2]).toBe("tool-call");
    expect(types[types.length - 1]).toBe("finish");
    expect(
      types.every((t) => t === "text-delta" || t === "tool-call" || t === "finish")
    ).toBe(true);

    const text = parts
      .filter((p) => p.type === "text-delta")
      .map((p) => (p as { textDelta: string }).textDelta)
      .join("");
    expect(text).toContain("free tier models");

    const toolCall = parts.find((p) => p.type === "tool-call") as {
      toolName: string;
      args: string;
    };
    expect(toolCall.toolName).toBe("str_replace_editor");
    const args = JSON.parse(toolCall.args);
    expect(args.command).toBe("create");
    expect(args.path).toBe("/App.jsx");
    expect(args.file_text).toContain("Unable to complete component");
  });

  test("stops without further edits once the message App.jsx is created", async () => {
    const mock = new MockLanguageModel("mock-fallback", true);
    const prompt = [
      {
        role: "tool" as const,
        content: [{ type: "text" as const, text: "File created: /App.jsx" }],
      },
    ];

    const result = await mock.doStream({ prompt, mode: { type: "regular" } } as any);
    const reader = result.stream.getReader();
    const streamed: Array<{ type: string; finishReason?: string }> = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      streamed.push(value);
    }
    expect(streamed.map((p) => p.type)).toEqual(["finish"]);
    expect(streamed[0].finishReason).toBe("stop");
  });
});
