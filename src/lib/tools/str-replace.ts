import { tool, jsonSchema } from "ai";
import { VirtualFileSystem } from "@/lib/file-system";

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
      const { command, path, file_text, insert_line, new_str, old_str, view_range } = args as Record<string, unknown>;
      switch (command as string) {
        case "view":
          return fileSystem.viewFile(
            path as string,
            view_range as [number, number] | undefined
          );

        case "create":
          return fileSystem.createFileWithParents(path as string, (file_text as string) || "");

        case "str_replace":
          return fileSystem.replaceInFile(path as string, (old_str as string) || "", (new_str as string) || "");

        case "insert":
          return fileSystem.insertInFile(path as string, (insert_line as number) || 0, (new_str as string) || "");

        case "undo_edit":
          return `Error: undo_edit command is not supported in this version. Use str_replace to revert changes.`;
      }
    },
  });
};
