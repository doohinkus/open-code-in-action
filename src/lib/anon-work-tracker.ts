// Simple utility to track if anonymous user has created work
const STORAGE_KEY = "uigen_has_anon_work";
const DATA_KEY = "uigen_anon_data";
const SESSION_KEY = "uigen_session_key";

// Stable per-browser-session identifier for anonymous users. Used as the
// server-side filesystem cache key so unauthenticated work stays isolated.
export function getOrCreateAnonSessionKey(): string {
  if (typeof window === "undefined") return "anon-unknown";
  let key = sessionStorage.getItem(SESSION_KEY);
  if (!key) {
    key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `anon-${crypto.randomUUID()}`
        : `anon-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, key);
  }
  return key;
}

export function setHasAnonWork(
  messages: unknown[],
  fileSystemData: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;

  // Only set if there's actual content. > 1 because root "/" always exists.
  if (messages.length > 0 || Object.keys(fileSystemData).length > 1) {
    sessionStorage.setItem(STORAGE_KEY, "true");
    // sessionStorage has a ~5 MB quota; a big generated project can exceed
    // it. Anonymous persistence is best-effort — never break the chat flow
    // with an uncaught QuotaExceededError.
    try {
      sessionStorage.setItem(DATA_KEY, JSON.stringify({ messages, fileSystemData }));
    } catch (error) {
      // Data was partially saved before; leave the flag alone and drop the
      // oversized payload rather than surfacing storage errors mid-chat.
      if (error instanceof Error && error.name === "QuotaExceededError") return;
      try {
        sessionStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Ignore storage failures entirely.
      }
    }
  }
}

export function getHasAnonWork(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(STORAGE_KEY) === "true";
}

export function getAnonWorkData(): { messages: any[], fileSystemData: any } | null {
  if (typeof window === "undefined") return null;
  
  const data = sessionStorage.getItem(DATA_KEY);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearAnonWork() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(DATA_KEY);
}