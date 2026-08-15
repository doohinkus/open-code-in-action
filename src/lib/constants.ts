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
 * abort the request so the UI doesn't hang indefinitely.
 */
export const STALL_TIMEOUT_MS = 130_000;

/**
 * Resource warning timeout: after this long of a single generation,
 * nudge the user to stop or simplify.
 */
export const RESOURCE_WARNING_TIMEOUT_MS = 35_000;

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

/**
 * Extended toast duration for important warnings (8 seconds).
 */
export const TOAST_WARNING_DURATION_MS = 8000;

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
