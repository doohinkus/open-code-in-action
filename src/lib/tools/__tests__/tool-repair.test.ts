import { describe, test, expect } from "vitest";
import { repairStrReplaceArgs, repairToolCall } from "@/lib/tools/tool-repair";

describe("repairStrReplaceArgs", () => {
  test("coerces the string 'true' overwrite", () => {
    const args = { command: "create", path: "/App.jsx", overwrite: "true" };
    expect(repairStrReplaceArgs(args)).toEqual({
      command: "create",
      path: "/App.jsx",
      overwrite: true,
    });
  });

  test("coerces the string 'false' overwrite", () => {
    const args = { command: "create", path: "/App.jsx", overwrite: "False" };
    expect(repairStrReplaceArgs(args)?.overwrite).toBe(false);
  });

  test("rejects an unrecognized overwrite value", () => {
    expect(repairStrReplaceArgs({ overwrite: "yes" })).toBeNull();
  });

  test("coerces string insert_line", () => {
    expect(repairStrReplaceArgs({ insert_line: "12" })).toEqual({
      insert_line: 12,
    });
    expect(repairStrReplaceArgs({ insert_line: "abc" })).toBeNull();
  });

  test("coerces string entries in view_range", () => {
    expect(repairStrReplaceArgs({ command: "view", path: "/x", view_range: ["2", 4] })).toEqual({
      command: "view",
      path: "/x",
      view_range: [2, 4],
    });
  });

  test("returns args untouched-shaped object when nothing needs coercion", () => {
    const args = { command: "view", path: "/x" };
    expect(repairStrReplaceArgs(args)).toEqual({ command: "view", path: "/x" });
  });
});

describe("repairToolCall", () => {
  test("repairs a loose-shape create with string overwrite", () => {
    const toolCall = {
      toolCallId: "c1",
      toolName: "str_replace_editor",
      args: JSON.stringify({
        command: "create",
        path: "/App.jsx",
        file_text: "x",
        overwrite: "true",
      }),
    };
    const repaired = repairToolCall(toolCall as any);
    expect(repaired).not.toBeNull();
    expect(JSON.parse((repaired as any).args).overwrite).toBe(true);
  });

  test("returns null for non-repairable calls", () => {
    expect(repairToolCall({ toolCallId: "c", toolName: "file_manager", args: "{}" } as any)).toBeNull();
    expect(repairToolCall({ toolCallId: "c", toolName: "unknown", args: "{}" } as any)).toBeNull();
    expect(
      repairToolCall({
        toolCallId: "c",
        toolName: "str_replace_editor",
        args: "not json",
      } as any)
    ).toBeNull();
    // Nothing wrong → nothing to repair.
    expect(
      repairToolCall({
        toolCallId: "c",
        toolName: "str_replace_editor",
        args: JSON.stringify({ command: "view", path: "/f" }),
      } as any)
    ).toBeNull();
  });
});
