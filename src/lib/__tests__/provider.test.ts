import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  getLanguageModel,
  buildLanguageModel,
  MockLanguageModel,
  createRateLimitFallbackModel,
  isRateLimitError,
} from "@/lib/provider";
import { DEFAULT_MODEL } from "@/lib/models";

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
      key === "ANTHROPIC_API_KEY" ||
      key === "FORCE_MOCK_PROVIDER"
    ) {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  clearProviderEnv();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getLanguageModel", () => {
  test("uses the env default model for the OpenAI-compatible provider", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "deepseek-v4-flash-free";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test";

    const model = getLanguageModel();
    expect(model.modelId).toBe("deepseek-v4-flash-free");
    expect(model.provider).toBe("opencode-compatible.chat");
  });

  test("overrides the model with the requested free id", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "deepseek-v4-flash-free";
    process.env.OPENAI_COMPATIBLE_API_KEY = "sk-test";

    const model = getLanguageModel("laguna-s-2.1-free");
    expect(model.modelId).toBe("laguna-s-2.1-free");
  });

  test("trims whitespace around the requested model id", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "deepseek-v4-flash-free";

    const model = getLanguageModel("  big-pickle  ");
    expect(model.modelId).toBe("big-pickle");
  });

  test("falls back to the env default for an empty override", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "deepseek-v4-flash-free";

    const model = getLanguageModel("   ");
    expect(model.modelId).toBe("deepseek-v4-flash-free");
  });

  test("defaults to a free model when the env model is paid", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "claude-haiku-4-5";

    const model = getLanguageModel();
    expect(model.modelId).toBe(DEFAULT_MODEL);
    expect(model.provider).toBe("opencode-compatible.chat");
  });

  test("defaults to a free model when the requested id is paid", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "deepseek-v4-flash-free";

    const model = getLanguageModel("gpt-5.4-mini");
    expect(model.modelId).toBe(DEFAULT_MODEL);
  });

  test("defaults to a free model when the env model is empty", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";

    const model = getLanguageModel();
    expect(model.modelId).toBe(DEFAULT_MODEL);
  });

  test("returns the mock provider when forced, ignoring overrides", () => {
    process.env.FORCE_MOCK_PROVIDER = "1";
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";

    const model = getLanguageModel("laguna-s-2.1-free");
    expect(model).toBeInstanceOf(MockLanguageModel);
    expect(model.modelId).toBe("mock-" + DEFAULT_MODEL);
  });

  test("returns the mock provider when no Zen endpoint is configured", () => {
    const model = getLanguageModel("laguna-s-2.1-free");
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
    expect(createRateLimitFallbackModel(mock, mock)).toBe(mock);
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

    const wrapped = createRateLimitFallbackModel(primary, fallback);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("fallback output");
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

    const wrapped = createRateLimitFallbackModel(primary, fallback);
    const result = await wrapped.doGenerate(GENERATE_OPTIONS as any);
    expect(result.text).toBe("primary output");
  });

  test("doGenerate rethrows non-rate-limit errors", async () => {
    const primary = fakeGenerateModel(() => {
      throw new Error("Bad gateway");
    });
    const fallback = fakeGenerateModel(() => ({ text: "fallback" }));

    const wrapped = createRateLimitFallbackModel(primary, fallback);
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

    const wrapped = createRateLimitFallbackModel(primary, fallback);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "ok" });
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

    const wrapped = createRateLimitFallbackModel(primary, fallback);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "finish"]);
    expect(parts[0]).toEqual({ type: "text-delta", textDelta: "ok" });
  });

  test("doStream falls back when an error part arrives before content with a rate limit", async () => {
    const primary = fakeStreamModel([
      { type: "error", error: new Error("Rate limit exceeded") },
    ]);
    const fallback = fakeStreamModel([{ type: "text-delta", textDelta: "ok" }]);

    const wrapped = createRateLimitFallbackModel(primary, fallback);
    const parts = await collectStreamParts(wrapped);
    expect(parts).toEqual([{ type: "text-delta", textDelta: "ok" }]);
  });

  test("doStream keeps the primary stream once content is flowing", async () => {
    const primary = fakeStreamModel([
      { type: "text-delta", textDelta: "hi" },
      { type: "error", error: new Error("Rate limit exceeded") },
    ]);
    const fallback = fakeStreamModel([{ type: "text-delta", textDelta: "should not appear" }]);

    const wrapped = createRateLimitFallbackModel(primary, fallback);
    const parts = await collectStreamParts(wrapped);
    expect(parts.map((p) => p.type)).toEqual(["text-delta", "error"]);
  });

  test("doStream propagates non-rate-limit stream errors", async () => {
    const primary = fakeStreamModel([], new Error("Bad gateway"));
    const wrapped = createRateLimitFallbackModel(primary, fakeStreamModel([]));

    await expect(collectStreamParts(wrapped)).rejects.toThrow("Bad gateway");
  });
});

describe("buildLanguageModel", () => {
  test("returns a wrapped real provider when Zen is configured", () => {
    process.env.OPENAI_COMPATIBLE_BASE_URL = "https://opencode.ai/zen/v1";
    process.env.OPENAI_COMPATIBLE_MODEL = "big-pickle";

    const model = buildLanguageModel();
    expect(model.provider).toBe("opencode-compatible.chat");
    expect(model.modelId).toBe("big-pickle");
  });

  test("returns the mock provider when Zen is not configured", () => {
    const model = buildLanguageModel();
    expect(model.provider).toBe("mock");
    expect(model.modelId).toBe("mock-" + DEFAULT_MODEL);
  });
});
