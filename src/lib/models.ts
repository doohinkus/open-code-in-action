export type ModelProvider = "google";

export interface ModelInfo {
  id: string;
  name: string;
  provider: ModelProvider;
}

// Google AI Studio's Gemini free tier — the only supported provider.
// Ordered by fallback priority: newest stable generation first.
export const GEMINI_FREE_MODELS: ModelInfo[] = [
  { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "google" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "google" },
  { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", provider: "google" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "google" },
];

// All selectable free models, in fallback priority order.
export const ALL_FREE_MODELS: ModelInfo[] = [...GEMINI_FREE_MODELS];

export const DEFAULT_MODEL = "gemini-3.6-flash";

// Gemini 2.5 models take a thinkingBudget (and can disable thinking with 0);
// Gemini 3.x models use thinkingLevel instead — which the pinned
// @ai-sdk/google schema strips — and can never disable thinking. The fallback
// chain must therefore never mix the two families: the request-level
// thinkingConfig has to be valid for every model in the chain.
export function supportsThinkingBudget(id: string): boolean {
  return id.startsWith("gemini-2.5-");
}

// Ids of the free models that can back `id` in the fallback chain: every
// allowed model except `id` itself, restricted to the same thinking family
// so the request-level thinkingConfig stays valid across rotations.
export function fallbackModelIds(id: string): string[] {
  const usesBudget = supportsThinkingBudget(id);
  return ALL_FREE_MODELS
    .filter((m) => m.id !== id && supportsThinkingBudget(m.id) === usesBudget)
    .map((m) => m.id);
}

const ALLOWED_MODEL_IDS = new Set(ALL_FREE_MODELS.map((m) => m.id));

export function isAllowedModel(id: string): boolean {
  return ALLOWED_MODEL_IDS.has(id);
}

// Which provider a free model id belongs to, or undefined for unknown ids.
export function modelProvider(id: string): ModelProvider | undefined {
  return ALL_FREE_MODELS.find((m) => m.id === id)?.provider;
}

export function isGeminiModel(id: string): boolean {
  return modelProvider(id) === "google";
}

// Resolve a requested model id against the free allowlist, falling back to a
// default when the id is missing, empty, or not free.
export function resolveFreeModel(id: string | undefined, fallback: string): string {
  const trimmed = id?.trim();
  return trimmed && isAllowedModel(trimmed) ? trimmed : fallback;
}

// Resolve a requested model id against a single provider's free models, so a
// non-Gemini id can never leak into the Google provider.
export function resolveProviderModel(
  id: string | undefined,
  provider: ModelProvider,
  fallback: string
): string {
  const trimmed = id?.trim();
  return trimmed && modelProvider(trimmed) === provider ? trimmed : fallback;
}

export function modelName(id: string): string {
  return (
    ALL_FREE_MODELS.find((m) => m.id === id)?.name ??
    id
  );
}
