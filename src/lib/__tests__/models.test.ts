import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ZEN_FREE_MODELS,
  DEFAULT_MODEL,
  isAllowedModel,
  modelName,
} from "@/lib/models";

describe("models", () => {
  test("defaults to big-pickle", () => {
    expect(DEFAULT_MODEL).toBe("big-pickle");
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
    expect(modelName("mimo-v2.5-free")).toBe("MiMo 2.5 Free");
    expect(modelName("unknown-model")).toBe("unknown-model");
  });

  test("treats retired models as unknown", () => {
    expect(isAllowedModel("hy3-free")).toBe(false);
    expect(modelName("hy3-free")).toBe("hy3-free");
  });

  test("includes exactly the allowed free models in order", () => {
    expect(ZEN_FREE_MODELS.map((m) => m.id)).toEqual([
      "big-pickle",
      "ling-3.0-flash-fin-free",
      "mimo-v2.5-free",
      "nemotron-3.5-lightning-free",
    ]);
  });
});
