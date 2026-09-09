import { describe, test, expect } from "vitest";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { VirtualFileSystem } from "@/lib/file-system";
import { repairToolCall } from "@/lib/tools/tool-repair";

// The tool accepts the inline schema's strict shapes, and streamText's
// experimental_repairToolCall repairs the loose shapes free models emit.
// These tests run through the same repair path the route uses.
function executeRepaired(fs: VirtualFileSystem, args: unknown) {
  const tool = buildStrReplaceTool(fs) as unknown as {
    execute: (args: unknown) => Promise<string>;
  };
  const parsed = args as Record<string, unknown>;
  const repaired = repairToolCall({
    toolCallId: "c",
    toolName: "str_replace_editor",
    args: JSON.stringify(parsed),
  } as any);
  const finalArgs = repaired
    ? JSON.parse((repaired as any).args)
    : parsed;
  return tool.execute(finalArgs);
}

describe("buildStrReplaceTool", () => {
  test("create replaces an existing file when overwrite is boolean true", async () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/App.jsx", "old");

    const result = await executeRepaired(fs, {
      command: "create",
      path: "/App.jsx",
      file_text: "new content",
      overwrite: true,
    });
    expect(result).toBe("File replaced: /App.jsx");
    expect(fs.readFile("/App.jsx")).toBe("new content");
  });

  test("create accepts the loose string 'true' (Qwen/GPT-OSS shape)", async () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/App.jsx", "old");

    const result = await executeRepaired(fs, {
      command: "create",
      path: "/App.jsx",
      file_text: "new content",
      overwrite: "true",
    });
    expect(result).toBe("File replaced: /App.jsx");
    expect(fs.readFile("/App.jsx")).toBe("new content");
  });

  test("string 'false' guards the overwrite", async () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/App.jsx", "old");

    const result = await executeRepaired(fs, {
      command: "create",
      path: "/App.jsx",
      file_text: "new content",
      overwrite: "false",
    });
    expect(result).toContain("Error: File already exists");
    expect(fs.readFile("/App.jsx")).toBe("old");
  });

  test("insert accepts insert_line as a string", async () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/f.js", "one\ntwo");

    const result = await executeRepaired(fs, {
      command: "insert",
      path: "/f.js",
      insert_line: "1",
      new_str: "middle",
    });
    expect(result).not.toMatch(/^Error/);
    expect(fs.readFile("/f.js")).toContain("middle");
  });

  test("view accepts view_range entries as strings", async () => {
    const fs = new VirtualFileSystem();
    fs.createFile("/f.js", "a\nb\nc");

    const result = await executeRepaired(fs, {
      command: "view",
      path: "/f.js",
      view_range: ["2", "3"],
    });
    expect(result).toContain("b");
    expect(result).toContain("c");
  });
});
