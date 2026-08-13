import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { getLanguageModel, MockLanguageModel } from "@/lib/provider";

const ORIGINAL_ENV = { ...process.env };

function clearProviderEnv() {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("OPENAI_COMPATIBLE_") ||
      key === "GOOGLE_API_KEY" ||
      key === "FORCE_MOCK_PROVIDER" ||
      key === "ANTHROPIC_API_KEY"
    ) {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  clearProviderEnv();
  vi.restoreAllMocks();
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

  test("overrides the model with the requested id", () => {
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

  test("returns the mock provider when forced, ignoring overrides", () => {
    process.env.FORCE_MOCK_PROVIDER = "1";

    const model = getLanguageModel("laguna-s-2.1-free");
    expect(model).toBeInstanceOf(MockLanguageModel);
    expect(model.modelId).toBe("mock-claude-haiku-4-5");
  });

  test("falls back to the mock provider when no real provider is configured", () => {
    const model = getLanguageModel("laguna-s-2.1-free");
    expect(model).toBeInstanceOf(MockLanguageModel);
  });
});
