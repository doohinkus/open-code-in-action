export function mapErrorMessage(raw: string): string {
  let serverMessage: string | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === "string") {
      serverMessage = parsed.error;
    } else if (parsed?.error?.message) {
      serverMessage = parsed.error.message;
    }
  } catch {
    // Not JSON — raw error message from the SDK/fetch layer.
  }

  const text = serverMessage || raw;
  if (/FreeUsageLimit|free usage|free tier/i.test(text)) {
    return "This model hit its free-tier limit. Try switching to another free model above, or try again later.";
  }
  if (/too many|rate limit/i.test(text)) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (/authenticat/i.test(text)) {
    return "Authentication required. Please sign in.";
  }
  if (/origin|blocked|forbidden/i.test(text)) {
    return "Request blocked. Please try again.";
  }
  if (/upstream idle|idle timeout|\[504\]/i.test(text)) {
    return "The AI provider timed out while streaming. Try again or switch models.";
  }
  if (/abort|timed out|timeout/i.test(text)) {
    return "Generation timed out. Please try again.";
  }
  if (/failed to fetch|network/i.test(text)) {
    return "Network error. Check your connection and try again.";
  }
  if (/internal server error/i.test(text)) {
    return "AI provider returned an internal server error. The model may be temporarily unavailable. Please try again or switch models.";
  }
  if (/CreditsError|no payment|billing|FreeUsageLimit|quota|insufficient credits/i.test(text)) {
    return "AI provider account has no credits or has hit its usage limit. Please add a payment method or try again later.";
  }
  if (text === "An error occurred.") {
    return "Something went wrong. Please try again.";
  }
  return text || "Something went wrong. Please try again.";
}
