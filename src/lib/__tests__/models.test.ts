import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ZEN_FREE_MODELS,
  DEFAULT_MODEL,
  isAllowedModel,
  modelName,
} from "@/lib/models";

describe("models", () => {
  test("defaults to deepseek-v4-flash-free", () => {
    expect(DEFAULT_MODEL).toBe("deepseek-v4-flash-free");
  });

  test("lists only free models with unique ids", () => {
    const ids = ZEN_FREE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ZEN_FREE_MODELS.every((m) => typeof m.name === "string" && m.name.length > 0)).toBe(
      true
    );
  });

  test("allows every listed free model", () => {
    for (const m of ZEN_FREE_MODELS) {
      expect(isAllowedModel(m.id)).toBe(true);
    }
  });

  test("rejects unknown models", () => {
    expect(isAllowedModel("gpt-5.4-mini")).toBe(false);
    expect(isAllowedModel("")).toBe(false);
    expect(isAllowedModel("  ")).toBe(false);
  });

  test("resolves names for known and unknown models", () => {
    expect(modelName("hy3-free")).toBe("Hy3 Free");
    expect(modelName("unknown-model")).toBe("unknown-model");
  });

  test("includes exactly the allowed free models in order", () => {
    expect(ZEN_FREE_MODELS.map((m) => m.id)).toEqual([
      "deepseek-v4-flash-free",
      "nemotron-3-ultra-free",
      "hy3-free",
    ]);
  });
});
