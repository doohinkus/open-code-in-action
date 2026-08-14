export interface ModelInfo {
  id: string;
  name: string;
}

export const ZEN_FREE_MODELS: ModelInfo[] = [
  { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free" },
  { id: "laguna-s-2.1-free", name: "Laguna S 2.1 Free" },
  { id: "big-pickle", name: "Big Pickle" },
  { id: "mimo-v2.5-free", name: "MiMo-V2.5 Free" },
  { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning Free" },
  { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free" },
  { id: "hy3-free", name: "Hy3 Free" },
  { id: "ling-3.0-tiny-free", name: "Ling-3.0-tiny Free" },
];

export const DEFAULT_MODEL = "deepseek-v4-flash-free";

const ALLOWED_MODEL_IDS = new Set(ZEN_FREE_MODELS.map((m) => m.id));

export function isAllowedModel(id: string): boolean {
  return ALLOWED_MODEL_IDS.has(id);
}

// Resolve a requested model id against the free allowlist, falling back to a
// default when the id is missing, empty, or not free.
export function resolveFreeModel(id: string | undefined, fallback: string): string {
  const trimmed = id?.trim();
  return trimmed && isAllowedModel(trimmed) ? trimmed : fallback;
}

export function modelName(id: string): string {
  return (
    ZEN_FREE_MODELS.find((m) => m.id === id)?.name ??
    id
  );
}
