// Centralized constants for the application.
// Grouped by domain for easy discovery.

// ─── Chat / API ──────────────────────────────────────────────────────────────

/** Maximum number of messages allowed in a single chat request */
export const MAX_MESSAGE_COUNT = 200;

/** Maximum length of a single message in characters */
export const MAX_MESSAGE_LENGTH = 50_000;

/** Maximum total length of all messages combined */
export const MAX_TOTAL_MESSAGES_LENGTH = 500_000;

/** Maximum number of files allowed in a single request */
export const MAX_FILES_COUNT = 500;

/** Maximum size of a single file in bytes */
export const MAX_FILE_SIZE = 100_000;

// ─── VFS Cache ───────────────────────────────────────────────────────────────

/** Time-to-live for cached virtual filesystem entries (10 minutes) */
export const VFS_CACHE_TTL_MS = 10 * 60 * 1000;

/** Maximum number of entries in the VFS cache */
export const VFS_CACHE_MAX_ENTRIES = 100;

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/** Rate limit window duration (1 minute) */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Maximum requests per IP within the rate limit window */
export const RATE_LIMIT_MAX_REQUESTS = 30;

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Stall timeout: if no stream activity for this duration while generating,
 * abort the request so the UI doesn't hang indefinitely. Generous on purpose:
 * Gemini 3.x can think silently for a minute+ per step, and server-side
 * fallback rotation can retry across models without emitting anything, so
 * quiet stretches of 2-3 minutes are legitimate.
 */
export const STALL_TIMEOUT_MS = 240_000;

/**
 * Maximum steps for real AI providers (allows multi-file builds).
 */
export const MAX_STEPS_REAL = 10;

/**
 * Maximum steps for mock provider (prevents canned sequence repetition).
 */
export const MAX_STEPS_MOCK = 4;

/**
 * Maximum tokens per AI call (non-test requests).
 */
export const MAX_TOKENS = 8_000;

/**
 * Maximum tokens per AI call for Gemini 3.x models. Those models always
 * think (thinking tokens count against this cap) and burn ~4-5k tokens even
 * at thinkingLevel "minimal", so the 8k default would cut them off with
 * finishReason "length" before the first tool call.
 */
export const MAX_TOKENS_GEMINI_3 = 24_000;

/**
 * Maximum tokens per AI call for Groq free-tier models. Groq bills prompt +
 * completion tokens against tight free-tier token-per-minute quotas, so this
 * stays far below the Gemini 3.x cap. Truncation mid-tool-call is costly —
 * cut-off JSON arguments fail to parse and kill the turn ("Failed to parse
 * tool call arguments as JSON") — and gpt-oss reasoning tokens count toward
 * this cap, so it must leave headroom above typical component builds.
 * Override with MAX_TOKENS_GROQ env var if Groq raises provider limits.
 */
export const MAX_TOKENS_GROQ_DEFAULT = 16_384;

/**
 * Maximum tokens for test-connection requests (minimal response).
 */
export const MAX_TOKENS_TEST = 64;

// ─── Preview ─────────────────────────────────────────────────────────────────

/**
 * Debounce delay for preview rebuilds after file changes.
 */
export const REBUILD_DEBOUNCE_MS = 350;

/**
 * Debounce delay for code editor changes before updating VFS.
 */
export const EDITOR_CHANGE_DEBOUNCE_MS = 300;

// ─── Message Compaction ──────────────────────────────────────────────────────

/**
 * Maximum number of messages to keep in history sent to the model.
 */
export const COMPACT_HISTORY_MAX_MESSAGES = 12;

/**
 * Maximum length of compacted message content.
 */
export const COMPACTED_MESSAGE_MAX_LEN = 300;

// ─── Toast ───────────────────────────────────────────────────────────────────

/**
 * Default toast auto-dismiss duration (3 seconds).
 */
export const TOAST_DEFAULT_DURATION_MS = 3000;

// ─── Share ───────────────────────────────────────────────────────────────────

/**
 * Maximum length for share names.
 */
export const MAX_SHARE_NAME_LENGTH = 200;

/**
 * Maximum number of files in a share.
 */
export const MAX_SHARE_FILES_COUNT = 500;

/**
 * Maximum size of a single file in a share.
 */
export const MAX_SHARE_FILE_SIZE = 100_000;
