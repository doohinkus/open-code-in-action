import { test, expect, describe } from "vitest";
import {
  generateShareToken,
  parseShareFiles,
  validateShareInput,
  MAX_SHARE_FILES_COUNT,
  MAX_SHARE_FILE_SIZE,
} from "@/lib/share-utils";

describe("generateShareToken", () => {
  test("generates a unique token matching the URL-safe pattern", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateShareToken()));
    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("parseShareFiles", () => {
  test("accepts a valid map of path to content", () => {
    const result = parseShareFiles({ "/App.jsx": "export default () => null" });
    expect(result).toEqual({ "/App.jsx": "export default () => null" });
  });

  test("returns null for non-object inputs", () => {
    expect(parseShareFiles(null)).toBeNull();
    expect(parseShareFiles(undefined)).toBeNull();
    expect(parseShareFiles("files")).toBeNull();
    expect(parseShareFiles(["/App.jsx"])).toBeNull();
  });

  test("returns null when a value is not a string", () => {
    expect(parseShareFiles({ "/App.jsx": 42 })).toBeNull();
  });
});

describe("validateShareInput", () => {
  test("accepts a valid share input", () => {
    expect(
      validateShareInput({ files: { "/App.jsx": "export default () => null" } })
    ).toBeNull();
  });

  test("rejects empty file sets", () => {
    expect(validateShareInput({ files: {} })).toBe("files must contain at least one file");
  });

  test("rejects too many files", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_SHARE_FILES_COUNT + 1; i++) {
      files[`/file${i}.jsx`] = "x";
    }
    const error = validateShareInput({ files });
    expect(error).toContain("files count exceeds limit");
  });

  test("rejects relative file paths", () => {
    const error = validateShareInput({ files: { "App.jsx": "x" } });
    expect(error).toBe("file paths must be absolute");
  });

  test("rejects oversized files", () => {
    const error = validateShareInput({
      files: { "/App.jsx": "x".repeat(MAX_SHARE_FILE_SIZE + 1) },
    });
    expect(error).toContain("exceeds size limit");
  });

  test("rejects invalid previousToken", () => {
    expect(
      validateShareInput({
        files: { "/App.jsx": "x" },
        previousToken: "bad token!",
      })
    ).toBe("previousToken is invalid");
  });

  test("accepts a valid previousToken", () => {
    expect(
      validateShareInput({
        files: { "/App.jsx": "x" },
        previousToken: "abc_123-DEF",
      })
    ).toBeNull();
  });

  test("rejects non-string name and projectId", () => {
    expect(
      validateShareInput({ files: { "/App.jsx": "x" }, name: 42 as any })
    ).toBe("name must be a string");
    expect(
      validateShareInput({ files: { "/App.jsx": "x" }, projectId: "" })
    ).toBe("projectId must be a string");
  });
});
