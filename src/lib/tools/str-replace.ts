import { tool, jsonSchema } from "ai";
import { VirtualFileSystem } from "@/lib/file-system";

// The inline schema stays strict: Google's function_declarations proto
// rejects type unions ("number"|"string"). Free models (notably GPT-OSS)
// still emit numbers/booleans as strings, invalidating their own
// tool calls — streamText repairs those via experimental_repairToolCall
// (see src/lib/tools/tool-repair.ts and its wiring in the chat route), and
// execute() additionally coerces so repaired and unrepaired payloads both
// land correctly.

export const buildStrReplaceTool = (fileSystem: VirtualFileSystem) => {
  return tool({
    description:
      "View, create, edit, insert text in files. Used for editing code and documentation files.",
    parameters: jsonSchema({
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: ["view", "create", "str_replace", "insert", "undo_edit"],
          description: "The type of operation to perform on the file",
        },
        path: {
          type: "string",
          description: "The absolute path to the file (e.g. /App.jsx)",
        },
        file_text: {
          type: "string",
          description:
            "Required for 'create' command: the full file content",
        },
        overwrite: {
          type: "boolean",
          description:
            "For 'create' command on an existing file: pass true to replace the file entirely. Omit to get an error prompting you to edit with str_replace instead.",
        },
        insert_line: {
          type: "number",
          description:
            "Required for 'insert' command: the line number to insert after (0-indexed)",
        },
        new_str: {
          type: "string",
          description:
            "Required for 'str_replace' and 'insert' commands: the new text to add",
        },
        old_str: {
          type: "string",
          description:
            "Required for 'str_replace' command: the exact text to replace",
        },
        view_range: {
          type: "array",
          items: { type: "number" },
          description:
            "Optional for 'view' command: a 2-element array [start_line, end_line] to limit the view",
        },
      },
      required: ["command", "path"],
    }),
    execute: async (args: unknown) => {
      const {
        command,
        path,
        file_text,
        overwrite,
        insert_line,
        new_str,
        old_str,
        view_range,
      } = args as Record<string, unknown>;

      const overwriteFlag = overwrite === true || overwrite === "true";
      const insertLine =
        typeof insert_line === "string" ? Number(insert_line) : insert_line;
      const viewRange = Array.isArray(view_range)
        ? (view_range.map((n) => (typeof n === "string" ? Number(n) : n)) as [
            number,
            number
          ])
        : undefined;

      switch (command as string) {
        case "view":
          return fileSystem.viewFile(path as string, viewRange);

        case "create":
          return fileSystem.createFileWithParents(
            path as string,
            (file_text as string) || "",
            overwriteFlag
          );

        case "str_replace":
          return fileSystem.replaceInFile(path as string, (old_str as string) || "", (new_str as string) || "");

        case "insert": {
          const idx = insertLine === undefined ? 0 : Number(insertLine);
          if (!Number.isFinite(idx)) {
            return `Error: insert_line must be a number, got: ${JSON.stringify(insert_line)}`;
          }
          return fileSystem.insertInFile(path as string, idx, (new_str as string) || "");
        }

        case "undo_edit":
          return `Error: undo_edit command is not supported in this version. Use str_replace to revert changes.`;
      }
    },
  });
};
