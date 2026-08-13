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

export function setHasAnonWork(messages: any[], fileSystemData: any) {
  if (typeof window === "undefined") return;
  
  // Only set if there's actual content
  if (messages.length > 0 || Object.keys(fileSystemData).length > 1) { // > 1 because root "/" always exists
    sessionStorage.setItem(STORAGE_KEY, "true");
    sessionStorage.setItem(DATA_KEY, JSON.stringify({ messages, fileSystemData }));
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