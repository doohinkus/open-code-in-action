import { randomBytes } from "crypto";

export const MAX_SHARE_FILES_COUNT = 500;
export const MAX_SHARE_FILE_SIZE = 100_000;
export const MAX_SHARE_NAME_LENGTH = 200;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export function generateShareToken(): string {
  return randomBytes(9).toString("base64url");
}

export function parseShareFiles(files: unknown): Record<string, string> | null {
  if (!files || typeof files !== "object" || Array.isArray(files)) return null;

  const record: Record<string, string> = {};
  for (const [path, content] of Object.entries(files as Record<string, unknown>)) {
    if (typeof path !== "string" || typeof content !== "string") return null;
    record[path] = content;
  }
  return record;
}

export interface ShareInput {
  files: Record<string, string>;
  name?: string;
  projectId?: string;
  previousToken?: string;
}

export function validateShareInput(input: ShareInput): string | null {
  const fileCount = Object.keys(input.files).length;
  if (fileCount === 0) return "files must contain at least one file";
  if (fileCount > MAX_SHARE_FILES_COUNT) {
    return `files count exceeds limit of ${MAX_SHARE_FILES_COUNT}`;
  }

  for (const [path, content] of Object.entries(input.files)) {
    if (!path.startsWith("/")) return "file paths must be absolute";
    if (content.length > MAX_SHARE_FILE_SIZE) {
      return `file ${path} exceeds size limit of ${MAX_SHARE_FILE_SIZE}`;
    }
  }

  if (input.name !== undefined && typeof input.name !== "string") {
    return "name must be a string";
  }
  if (
    input.projectId !== undefined &&
    (typeof input.projectId !== "string" || input.projectId.length === 0)
  ) {
    return "projectId must be a string";
  }
  if (
    input.previousToken !== undefined &&
    (typeof input.previousToken !== "string" || !TOKEN_PATTERN.test(input.previousToken))
  ) {
    return "previousToken is invalid";
  }

  return null;
}
