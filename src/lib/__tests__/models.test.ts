import { describe, test, expect } from "vitest";
import {
  GEMINI_FREE_MODELS,
  ZEN_FREE_MODELS,
  ALL_FREE_MODELS,
  DEFAULT_MODEL,
  ZEN_DEFAULT_MODEL,
  isAllowedModel,
  isGeminiModel,
  modelProvider,
  modelName,
  resolveFreeModel,
  resolveProviderModel,
} from "@/lib/models";

describe("models", () => {
  test("defaults to gemini-2.5-flash with a separate Zen default", () => {
    expect(DEFAULT_MODEL).toBe("gemini-2.5-flash");
    expect(ZEN_DEFAULT_MODEL).toBe("big-pickle");
  });

  test("lists only free models with unique ids", () => {
    const ids = ALL_FREE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_FREE_MODELS.every((m) => typeof m.name === "string" && m.name.length > 0)).toBe(
      true
    );
  });

  test("tags every model with a known provider", () => {
    for (const m of ALL_FREE_MODELS) {
      expect(["google", "zen"]).toContain(m.provider);
    }
  });

  test("allows every listed free model", () => {
    for (const m of ALL_FREE_MODELS) {
      expect(isAllowedModel(m.id)).toBe(true);
    }
  });

  test("rejects unknown models", () => {
    expect(isAllowedModel("gpt-5.4-mini")).toBe(false);
    expect(isAllowedModel("hy3-free")).toBe(false);
    expect(isAllowedModel("")).toBe(false);
    expect(isAllowedModel("  ")).toBe(false);
  });

  test("treats retired models as unknown", () => {
    expect(isAllowedModel("hy3-free")).toBe(false);
    expect(modelName("hy3-free")).toBe("hy3-free");
  });

  test("resolves names for known and unknown models", () => {
    expect(modelName("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    expect(modelName("big-pickle")).toBe("Big Pickle Free");
    expect(modelName("unknown-model")).toBe("unknown-model");
  });

  test("maps model ids to their providers", () => {
    expect(modelProvider("gemini-2.5-flash")).toBe("google");
    expect(modelProvider("mimo-v2.5-free")).toBe("zen");
    expect(modelProvider("hy3-free")).toBeUndefined();
    expect(isGeminiModel("gemini-2.5-flash")).toBe(true);
    expect(isGeminiModel("mimo-v2.5-free")).toBe(false);
    expect(isGeminiModel("unknown-model")).toBe(false);
  });

  test("includes exactly the allowed free models in order", () => {
    expect(GEMINI_FREE_MODELS.map((m) => m.id)).toEqual([
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
    expect(ZEN_FREE_MODELS.map((m) => m.id)).toEqual([
      "big-pickle",
      "ling-3.0-flash-fin-free",
      "mimo-v2.5-free",
      "nemotron-3.5-lightning-free",
    ]);
  });

  test("resolves free models against the unified allowlist", () => {
    expect(resolveFreeModel("gemini-2.5-flash-lite", "x")).toBe("gemini-2.5-flash-lite");
    expect(resolveFreeModel("big-pickle", "x")).toBe("big-pickle");
    expect(resolveFreeModel("gpt-5.4-mini", "x")).toBe("x");
    expect(resolveFreeModel(undefined, "x")).toBe("x");
  });

  test("resolves models scoped to a single provider", () => {
    expect(resolveProviderModel("gemini-2.5-flash", "google", "fallback")).toBe(
      "gemini-2.5-flash"
    );
    expect(resolveProviderModel("big-pickle", "google", "fallback")).toBe("fallback");
    expect(resolveProviderModel("gemini-2.5-flash", "zen", "fallback")).toBe("fallback");
    expect(resolveProviderModel(undefined, "zen", "fallback")).toBe("fallback");
  });
});
