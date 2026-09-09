import type { LanguageModelV1FunctionToolCall } from "@ai-sdk/provider";

/**
 * Repairs tool calls whose arguments violate the strict inline JSON schema.
 *
 * Free models (notably Qwen and GPT-OSS) emit numbers/booleans as strings
 * (`"insert_line": "1"`, `"overwrite": "true"`), which fails schema
 * validation — in ai SDK v4 that surfaces as an invalid_tool_input error and
 * kills the turn with a raw toast. streamText's `experimental_repairToolCall`
 * hands us such calls before failing: coerce the known loose shapes (and
 * nothing else) and return a repaired call, or null to let the failure
 * propagate.
 */

const TRUE_STRINGS = new Set(["true", "True", "TRUE"]);
const FALSE_STRINGS = new Set(["false", "False", "FALSE"]);
const INTEGER_STRING_RE = /^-?\d+$/;

export function repairStrReplaceArgs(
  args: Record<string, unknown>
): Record<string, unknown> | null {
  const repaired: Record<string, unknown> = { ...args };

  // overwrite: "true" → true.
  if (typeof repaired.overwrite === "string") {
    if (TRUE_STRINGS.has(repaired.overwrite)) repaired.overwrite = true;
    else if (FALSE_STRINGS.has(repaired.overwrite)) repaired.overwrite = false;
    else return null; // unrecognized shape — don't guess
  }

  // insert_line: "12" → 12; anything else is unrecoverable for this schema.
  if (typeof repaired.insert_line === "string") {
    if (!INTEGER_STRING_RE.test(repaired.insert_line)) return null;
    repaired.insert_line = Number(repaired.insert_line);
  }

  // view_range: ["2", "3"] → [2, 3].
  if (Array.isArray(repaired.view_range)) {
    repaired.view_range = repaired.view_range.map((n) =>
      typeof n === "string" && INTEGER_STRING_RE.test(n) ? Number(n) : n
    );
  }

  return repaired;
}

export function repairToolCall(
  toolCall: LanguageModelV1FunctionToolCall
): LanguageModelV1FunctionToolCall | null {
  if (toolCall.toolName !== "str_replace_editor") return null;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.args) as Record<string, unknown>;
  } catch {
    return null;
  }

  const repairedArgs = repairStrReplaceArgs(args);
  if (!repairedArgs) return null;

  // If nothing changed, this wasn't a shape problem we can fix.
  if (JSON.stringify(repairedArgs) === JSON.stringify(args)) return null;

  return { ...toolCall, args: JSON.stringify(repairedArgs) };
}
