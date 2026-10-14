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
    expect(
      repairStrReplaceArgs({ command: "insert", insert_line: "12" })
    ).toEqual({ command: "insert", insert_line: 12 });
    expect(
      repairStrReplaceArgs({ command: "insert", insert_line: "abc" })
    ).toBeNull();
  });

  test("coerces string entries in view_range", () => {
    expect(repairStrReplaceArgs({ command: "view", path: "/x", view_range: ["2", 4] })).toEqual({
      command: "view",
      path: "/x",
      view_range: [2, 4],
    });
  });

  test("infers a missing command from file_text (create)", () => {
    expect(
      repairStrReplaceArgs({ path: "/App.jsx", file_text: "x", overwrite: true })
    ).toEqual({ path: "/App.jsx", file_text: "x", overwrite: true, command: "create" });
  });

  test("infers a missing command from overwrite (create)", () => {
    expect(repairStrReplaceArgs({ path: "/App.jsx", overwrite: false })).toEqual({
      path: "/App.jsx",
      overwrite: false,
      command: "create",
    });
  });

  test("infers a missing command from old_str (str_replace)", () => {
    expect(repairStrReplaceArgs({ path: "/x", old_str: "a", new_str: "b" })).toEqual({
      path: "/x",
      old_str: "a",
      new_str: "b",
      command: "str_replace",
    });
  });

  test("infers a missing command from insert_line (insert)", () => {
    expect(repairStrReplaceArgs({ path: "/x", insert_line: 2, new_str: "y" })).toEqual({
      path: "/x",
      insert_line: 2,
      new_str: "y",
      command: "insert",
    });
  });

  test("infers a missing command from view_range (view)", () => {
    expect(repairStrReplaceArgs({ path: "/x", view_range: [1, 5] })).toEqual({
      path: "/x",
      view_range: [1, 5],
      command: "view",
    });
  });

  test("returns null when nothing hints at the missing command", () => {
    expect(repairStrReplaceArgs({ path: "/x" })).toBeNull();
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
