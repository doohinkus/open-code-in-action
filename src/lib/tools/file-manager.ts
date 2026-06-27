import { tool, jsonSchema } from "ai";
import { VirtualFileSystem } from "../file-system";

export function buildFileManagerTool(fileSystem: VirtualFileSystem) {
  return tool({
    description:
      'Rename or delete files or folders in the file system. Rename can be used to "move" a file. Rename will recursively create folders as required.',
    parameters: jsonSchema({
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: ["rename", "delete"],
          description: "The operation to perform",
        },
        path: {
          type: "string",
          description:
            "The path to the file or directory to rename or delete",
        },
        new_path: {
          type: "string",
          description:
            "The new path. Only provide when renaming or moving a file.",
        },
      },
      required: ["command", "path"],
    }),
    execute: async ({
      command,
      path,
      new_path,
    }: {
      command: "rename" | "delete";
      path: string;
      new_path?: string;
    }) => {
      if (command === "rename") {
        if (!new_path) {
          return {
            success: false,
            error: "new_path is required for rename command",
          };
        }
        const success = fileSystem.rename(path, new_path);
        if (success) {
          return {
            success: true,
            message: `Successfully renamed ${path} to ${new_path}`,
          };
        } else {
          return {
            success: false,
            error: `Failed to rename ${path} to ${new_path}`,
          };
        }
      } else if (command === "delete") {
        const success = fileSystem.deleteFile(path);
        if (success) {
          return { success: true, message: `Successfully deleted ${path}` };
        } else {
          return { success: false, error: `Failed to delete ${path}` };
        }
      }

      return { success: false, error: "Invalid command" };
    },
  });
}
