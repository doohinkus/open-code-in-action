import { describe, test, expect } from "vitest";
import {
  GEMINI_FREE_MODELS,
  GROQ_FREE_MODELS,
  ALL_FREE_MODELS,
  DEFAULT_GROQ_MODEL,
  DEFAULT_MODEL,
  fallbackModelIds,
  isAllowedModel,
  isGeminiModel,
  modelProvider,
  modelName,
  resolveFreeModel,
  resolveProviderModel,
  supportsThinkingBudget,
} from "@/lib/models";

describe("models", () => {
  test("defaults to gemini-3.6-flash", () => {
    expect(DEFAULT_MODEL).toBe("gemini-3.6-flash");
  });

  test("defaults Groq to gpt-oss-120b", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
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
      expect(["google", "groq"]).toContain(m.provider);
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
    // Dropped Oct 2026 for free-tier timeouts.
    expect(isAllowedModel("gemini-3.8-flash")).toBe(false);
  });

  test("resolves names for known and unknown models", () => {
    expect(modelName("gemini-3.6-flash")).toBe("Gemini 3.6 Flash");
    expect(modelName("unknown-model")).toBe("unknown-model");
  });

  test("maps model ids to their providers", () => {
    expect(modelProvider("gemini-3.6-flash")).toBe("google");
    expect(modelProvider("openai/gpt-oss-120b")).toBe("groq");
    expect(modelProvider("big-pickle")).toBeUndefined();
    expect(modelProvider("hy3-free")).toBeUndefined();
    expect(isGeminiModel("gemini-3.6-flash")).toBe(true);
    expect(isGeminiModel("openai/gpt-oss-120b")).toBe(false);
    expect(isGeminiModel("big-pickle")).toBe(false);
    expect(isGeminiModel("unknown-model")).toBe(false);
  });

  test("lists exactly the free models in order", () => {
    expect(GEMINI_FREE_MODELS.map((m) => m.id)).toEqual(["gemini-3.6-flash"]);
    expect(GROQ_FREE_MODELS.map((m) => m.id)).toEqual([
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
    ]);
    expect(ALL_FREE_MODELS).toEqual([...GROQ_FREE_MODELS, ...GEMINI_FREE_MODELS]);
  });

  test("does not list retired Gemini generations", () => {
    for (const m of ALL_FREE_MODELS) {
      expect(m.id.startsWith("gemini-3.5")).toBe(false);
      expect(m.id.startsWith("gemini-2.5")).toBe(false);
    }
    expect(isAllowedModel("gemini-3.5-flash")).toBe(false);
    expect(isAllowedModel("gemini-3.5-flash-lite")).toBe(false);
    expect(isAllowedModel("gemini-3.1-flash-lite")).toBe(false);
  });

  test("resolves free models against the unified allowlist", () => {
    expect(resolveFreeModel("gemini-3.1-flash-lite", "x")).toBe("x");
    expect(resolveFreeModel("big-pickle", "x")).toBe("x");
    expect(resolveFreeModel("gpt-5.4-mini", "x")).toBe("x");
    expect(resolveFreeModel(undefined, "x")).toBe("x");
  });

  test("resolves models scoped to a single provider", () => {
    expect(resolveProviderModel("gemini-3.6-flash", "google", "fallback")).toBe(
      "gemini-3.6-flash"
    );
    expect(resolveProviderModel("big-pickle", "google", "fallback")).toBe("fallback");
    expect(resolveProviderModel(undefined, "google", "fallback")).toBe("fallback");
  });
});

describe("supportsThinkingBudget", () => {
  test("true for the Gemini 2.5 family", () => {
    expect(supportsThinkingBudget("gemini-2.5-flash")).toBe(true);
    expect(supportsThinkingBudget("gemini-2.5-flash-lite")).toBe(true);
  });

  test("false for Gemini 3.x models", () => {
    expect(supportsThinkingBudget("gemini-3.6-flash")).toBe(false);
  });

  test("false for unknown ids", () => {
    expect(supportsThinkingBudget("gpt-5.4-mini")).toBe(false);
  });
});

describe("fallbackModelIds", () => {
  test("keeps 3.x fallbacks in the 3.x family, priority order", () => {
    // Only one Google model remains after gemini-3.8-flash was dropped, so a
    // Gemini request has no same-provider fallback — cross-provider (Groq)
    // rotation is appended separately by the chain builder.
    expect(fallbackModelIds("gemini-3.6-flash")).toEqual([]);
  });

  test("never mixes thinking families", () => {
    for (const m of ALL_FREE_MODELS) {
      for (const id of fallbackModelIds(m.id)) {
        expect(supportsThinkingBudget(id)).toBe(supportsThinkingBudget(m.id));
      }
    }
  });

  test("returns Gemini models only (cross-provider chains are built separately)", () => {
    expect(fallbackModelIds("openai/gpt-oss-120b")).toEqual(["gemini-3.6-flash"]);
  });
});
