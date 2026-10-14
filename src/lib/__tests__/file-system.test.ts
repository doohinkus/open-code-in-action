import { test, expect } from "vitest";
import { VirtualFileSystem } from "@/lib/file-system";

test("creates a new file system with root directory", () => {
  const fs = new VirtualFileSystem();
  const root = fs.getNode("/");

  expect(root).toBeDefined();
  expect(root?.type).toBe("directory");
  expect(root?.name).toBe("/");
  expect(root?.path).toBe("/");
});

test("normalizes paths correctly", () => {
  const fs = new VirtualFileSystem();

  // Test by creating files with different path formats
  fs.createFile("test.txt", "content");
  expect(fs.exists("/test.txt")).toBe(true);

  // Test path normalization - createFile now creates parent directories
  fs.createFile("//folder//file.txt", "content");
  expect(fs.exists("/folder/file.txt")).toBe(true);

  fs.createFile("/trailing/", "content");
  expect(fs.exists("/trailing")).toBe(true);
});

test("creates files in root directory", () => {
  const fs = new VirtualFileSystem();
  const file = fs.createFile("/test.txt", "Hello World");

  expect(file).toBeDefined();
  expect(file?.type).toBe("file");
  expect(file?.name).toBe("test.txt");
  expect(file?.path).toBe("/test.txt");
  expect(file?.content).toBe("Hello World");
});

test("creates directories", () => {
  const fs = new VirtualFileSystem();
  const dir = fs.createDirectory("/src");

  expect(dir).toBeDefined();
  expect(dir?.type).toBe("directory");
  expect(dir?.name).toBe("src");
  expect(dir?.path).toBe("/src");
  expect(dir?.children).toBeDefined();
});

test("creates nested files and directories", () => {
  const fs = new VirtualFileSystem();

  // createFile now automatically creates parent directories
  const file = fs.createFile(
    "/src/components/Button.tsx",
    "export const Button = () => {};"
  );

  expect(file).toBeDefined();
  expect(file?.path).toBe("/src/components/Button.tsx");
  expect(fs.exists("/src")).toBe(true);
  expect(fs.exists("/src/components")).toBe(true);
  expect(fs.readFile("/src/components/Button.tsx")).toBe(
    "export const Button = () => {};"
  );
});

test("returns null when creating existing file", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "content");
  const duplicate = fs.createFile("/test.txt", "new content");

  expect(duplicate).toBeNull();
  expect(fs.readFile("/test.txt")).toBe("content");
});

test("returns null when creating existing directory", () => {
  const fs = new VirtualFileSystem();

  fs.createDirectory("/src");
  const duplicate = fs.createDirectory("/src");

  expect(duplicate).toBeNull();
});

test("creates file with parent directories automatically", () => {
  const fs = new VirtualFileSystem();
  const file = fs.createFile("/nonexistent/test.txt", "content");

  expect(file).toBeDefined();
  expect(file?.path).toBe("/nonexistent/test.txt");
  expect(fs.exists("/nonexistent")).toBe(true);
  expect(fs.readFile("/nonexistent/test.txt")).toBe("content");
});

test("creates deeply nested file with all parent directories", () => {
  const fs = new VirtualFileSystem();
  const file = fs.createFile("/a/b/c/d/e/file.txt", "deep content");

  expect(file).toBeDefined();
  expect(file?.path).toBe("/a/b/c/d/e/file.txt");
  expect(fs.exists("/a")).toBe(true);
  expect(fs.exists("/a/b")).toBe(true);
  expect(fs.exists("/a/b/c")).toBe(true);
  expect(fs.exists("/a/b/c/d")).toBe(true);
  expect(fs.exists("/a/b/c/d/e")).toBe(true);
  expect(fs.readFile("/a/b/c/d/e/file.txt")).toBe("deep content");
});

test("reads file content", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "Hello World");
  expect(fs.readFile("/test.txt")).toBe("Hello World");

  fs.createFile("/empty.txt", "");
  expect(fs.readFile("/empty.txt")).toBe("");
});

test("returns null when reading non-existent file", () => {
  const fs = new VirtualFileSystem();
  expect(fs.readFile("/nonexistent.txt")).toBeNull();
});

test("returns null when reading directory as file", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");
  expect(fs.readFile("/src")).toBeNull();
});

test("updates file content", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "original");
  const updated = fs.updateFile("/test.txt", "updated");

  expect(updated).toBe(true);
  expect(fs.readFile("/test.txt")).toBe("updated");
});

test("returns false when updating non-existent file", () => {
  const fs = new VirtualFileSystem();
  const updated = fs.updateFile("/nonexistent.txt", "content");

  expect(updated).toBe(false);
});

test("returns false when updating directory", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");
  const updated = fs.updateFile("/src", "content");

  expect(updated).toBe(false);
});

test("deletes files", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "content");
  const deleted = fs.deleteFile("/test.txt");

  expect(deleted).toBe(true);
  expect(fs.exists("/test.txt")).toBe(false);
});

test("deletes directories recursively", () => {
  const fs = new VirtualFileSystem();

  fs.createDirectory("/src");
  fs.createDirectory("/src/components");
  fs.createFile("/src/components/Button.tsx", "content");
  fs.createFile("/src/index.ts", "content");

  const deleted = fs.deleteFile("/src");

  expect(deleted).toBe(true);
  expect(fs.exists("/src")).toBe(false);
  expect(fs.exists("/src/components")).toBe(false);
  expect(fs.exists("/src/components/Button.tsx")).toBe(false);
  expect(fs.exists("/src/index.ts")).toBe(false);
});

test("returns false when deleting non-existent file", () => {
  const fs = new VirtualFileSystem();
  expect(fs.deleteFile("/nonexistent.txt")).toBe(false);
});

test("returns false when deleting root directory", () => {
  const fs = new VirtualFileSystem();
  expect(fs.deleteFile("/")).toBe(false);
});

test("checks if path exists", () => {
  const fs = new VirtualFileSystem();

  expect(fs.exists("/")).toBe(true);
  expect(fs.exists("/nonexistent")).toBe(false);

  fs.createFile("/test.txt", "content");
  expect(fs.exists("/test.txt")).toBe(true);

  fs.createDirectory("/src");
  expect(fs.exists("/src")).toBe(true);
});

test("lists directory contents", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "content");
  fs.createDirectory("/src");
  fs.createFile("/README.md", "content");

  const contents = fs.listDirectory("/");

  expect(contents).toHaveLength(3);
  expect(contents?.map((n) => n.name).sort()).toEqual([
    "README.md",
    "src",
    "test.txt",
  ]);
});

test("returns null when listing non-directory", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");

  expect(fs.listDirectory("/test.txt")).toBeNull();
  expect(fs.listDirectory("/nonexistent")).toBeNull();
});

test("returns empty array for empty directory", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/empty");

  const contents = fs.listDirectory("/empty");
  expect(contents).toEqual([]);
});

test("gets all files as a map", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "content1");
  fs.createDirectory("/src");
  fs.createFile("/src/index.ts", "content2");
  fs.createFile("/src/app.ts", "content3");

  const files = fs.getAllFiles();

  expect(files.size).toBe(3);
  expect(files.get("/test.txt")).toBe("content1");
  expect(files.get("/src/index.ts")).toBe("content2");
  expect(files.get("/src/app.ts")).toBe("content3");
  expect(files.has("/src")).toBe(false);
});

test("serializes file system to plain object", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/test.txt", "content");
  fs.createDirectory("/src");
  fs.createFile("/src/index.ts", "export {}");

  const serialized = fs.serialize();

  expect(serialized["/"].type).toBe("directory");
  expect(serialized["/test.txt"].type).toBe("file");
  expect(serialized["/test.txt"].content).toBe("content");
  expect(serialized["/src"].type).toBe("directory");
  expect(serialized["/src/index.ts"].type).toBe("file");
  expect(serialized["/src/index.ts"].content).toBe("export {}");
});

test("deserializes from node map, synthesizing parent directories", () => {
  const fs = new VirtualFileSystem();

  const data = {
    "/": { type: "directory" as const, name: "/", path: "/" },
    "/test.txt": {
      type: "file" as const,
      name: "test.txt",
      path: "/test.txt",
      content: "content1",
    },
    "/src/components/Button.tsx": {
      type: "file" as const,
      name: "Button.tsx",
      path: "/src/components/Button.tsx",
      content: "button content",
    },
    "/src/index.ts": {
      type: "file" as const,
      name: "index.ts",
      path: "/src/index.ts",
      content: "index content",
    },
  };

  fs.deserializeFromNodes(data);

  expect(fs.readFile("/test.txt")).toBe("content1");
  expect(fs.readFile("/src/components/Button.tsx")).toBe("button content");
  expect(fs.readFile("/src/index.ts")).toBe("index content");
  expect(fs.exists("/src")).toBe(true);
  expect(fs.exists("/src/components")).toBe(true);
});

test("deserializeFromNodes normalizes paths before walking", () => {
  const fs = new VirtualFileSystem();

  fs.deserializeFromNodes({
    "/src//a/../b/c.jsx": {
      type: "file" as const,
      name: "c.jsx",
      path: "/src//a/../b/c.jsx",
      content: "hello",
    },
  });

  expect(fs.exists("/a")).toBe(false);
  expect(fs.readFile("/src/b/c.jsx")).toBe("hello");
});

test("deserializeFromNodes rejects a file node that also has children", () => {
  const fs = new VirtualFileSystem();

  expect(() =>
    fs.deserializeFromNodes({
      "/components": {
        type: "file" as const,
        name: "components",
        path: "/components",
        content: "conflict",
      },
      "/components/Button.tsx": {
        type: "file" as const,
        name: "Button.tsx",
        path: "/components/Button.tsx",
        content: "content",
      },
    })
  ).toThrow(/is a file node/);
});

test("deserializes from node map", () => {
  const fs = new VirtualFileSystem();

  const data = {
    "/": { type: "directory" as const, name: "/", path: "/" },
    "/src": { type: "directory" as const, name: "src", path: "/src" },
    "/src/index.ts": {
      type: "file" as const,
      name: "index.ts",
      path: "/src/index.ts",
      content: "export {}",
    },
  };

  fs.deserializeFromNodes(data);

  expect(fs.exists("/src")).toBe(true);
  expect(fs.readFile("/src/index.ts")).toBe("export {}");
});

test("viewFile shows file content with line numbers", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "line1\nline2\nline3");

  const view = fs.viewFile("/test.txt");
  expect(view).toBe("1\tline1\n2\tline2\n3\tline3");
});

test("viewFile with view range", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "line1\nline2\nline3\nline4\nline5");

  const view = fs.viewFile("/test.txt", [2, 4]);
  expect(view).toBe("2\tline2\n3\tline3\n4\tline4");

  const viewToEnd = fs.viewFile("/test.txt", [3, -1]);
  expect(viewToEnd).toBe("3\tline3\n4\tline4\n5\tline5");
});

test("viewFile shows directory contents", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");
  fs.createFile("/src/index.ts", "");
  fs.createDirectory("/src/components");

  const view = fs.viewFile("/src");
  expect(view).toBe("[DIR] components\n[FILE] index.ts");
});

test("viewFile shows empty directory", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/empty");

  const view = fs.viewFile("/empty");
  expect(view).toBe("(empty directory)");
});

test("viewFile shows empty file", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/empty.txt", "");

  const view = fs.viewFile("/empty.txt");
  expect(view).toBe("1\t");
});

test("viewFile returns error for non-existent path", () => {
  const fs = new VirtualFileSystem();

  const view = fs.viewFile("/nonexistent");
  expect(view).toBe("File not found: /nonexistent");
});

test("createFileWithParents creates parent directories", () => {
  const fs = new VirtualFileSystem();

  const result = fs.createFileWithParents(
    "/src/components/Button.tsx",
    "content"
  );

  expect(result).toBe("File created: /src/components/Button.tsx");
  expect(fs.exists("/src")).toBe(true);
  expect(fs.exists("/src/components")).toBe(true);
  expect(fs.readFile("/src/components/Button.tsx")).toBe("content");
});

test("createFileWithParents returns a guidance error for existing files", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");

  const result = fs.createFileWithParents("/test.txt", "new content");
  expect(result).toContain("Error: File already exists: /test.txt");
  expect(result).toContain("overwrite");
  expect(fs.readFile("/test.txt")).toBe("content");
});

test("createFileWithParents overwrites an existing file when asked", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "old");

  const result = fs.createFileWithParents("/test.txt", "new", true);
  expect(result).toBe("File replaced: /test.txt");
  expect(fs.readFile("/test.txt")).toBe("new");
});

test("replaceInFile replaces a single occurrence", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "foo bar baz");

  const result = fs.replaceInFile("/test.txt", "foo", "hello");

  expect(result).toBe("Replaced 1 occurrence of the string in /test.txt — /test.txt updated");
  expect(fs.readFile("/test.txt")).toBe("hello bar baz");
});

test("replaceInFile errors on multiple matches to avoid corrupting code", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "foo bar foo baz foo");

  const result = fs.replaceInFile("/test.txt", "foo", "hello");

  expect(result).toContain(`Error: Found 3 occurrences`);
  expect(result).toContain("must match exactly one location");
  expect(fs.readFile("/test.txt")).toBe("foo bar foo baz foo");
});

test("replaceInFile multiple-match error lists line numbers and snippets", () => {
  const fs = new VirtualFileSystem();
  fs.createFile(
    "/test.txt",
    [
      "const title = 'counter';",
      "const buttonClass = 'bg-pink-500'; // primary",
      "const textClass = 'bg-pink-500'; // heading",
      "const focus = 'ring-pink-500';",
    ].join("\n")
  );

  // An over-generic old_str the model might guess: matches twice.
  const result = fs.replaceInFile("/test.txt", "const buttonClass", "x");

  // Only one occurrence, no listing needed.
  expect(result).toBe(
    "Replaced 1 occurrence of the string in /test.txt — /test.txt updated"
  );
  fs.createFile("/other.txt", "a\nbg-pink-500\nb\nbg-pink-500\nc");

  const ambiguous = fs.replaceInFile("/other.txt", "bg-pink-500", "bg-blue-500");

  expect(ambiguous).toContain("Error: Found 2 occurrences");
  expect(ambiguous).toContain("does your edit target one of them?");
  expect(ambiguous).toContain("line 2:");
  expect(ambiguous).toContain("line 4:");
  expect(ambiguous).toContain("bg-pink-500"); // snippet content present
  // File untouched while ambiguous.
  expect(fs.readFile("/other.txt")).toBe("a\nbg-pink-500\nb\nbg-pink-500\nc");
});

test("replaceInFile multiple-match error truncates after 5 occurrences", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "dup\ndup\ndup\ndup\ndup\ndup\ndup");

  const result = fs.replaceInFile("/test.txt", "dup", "new");

  expect(result).toContain("Error: Found 7 occurrences");
  expect(result).toContain("(+2 more occurrences)");
  const listedLines = result
    .split("\n")
    .filter((l) => /^\s+\d+\.\sline\s/.test(l));
  expect(listedLines).toHaveLength(5);
});

test("replaceInFile handles empty replacement", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "foo bar baz");

  const result = fs.replaceInFile("/test.txt", "foo", "");

  expect(result).toBe("Replaced 1 occurrence of the string in /test.txt — /test.txt updated");
  expect(fs.readFile("/test.txt")).toBe(" bar baz");
});

test("replaceInFile recovers a tab-separated numbered 'view' paste", () => {
  // Models sometimes copy the whole numbered rendering of 'view' into
  // old_str. The prefixes (as viewFile emits them: `<n>\t<line>`) must be
  // stripped and the raw content matched instead.
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "alpha\nbeta\ngamma");

  const view = fs.viewFile("/test.txt");
  const result = fs.replaceInFile("/test.txt", view, "delta");

  expect(result).toContain("Replaced 1 occurrence of the string in /test.txt");
  expect(result).toContain("stripping them");
  expect(fs.readFile("/test.txt")).toBe("delta");
});

test("replaceInFile recovers a space-collapsed numbered 'view' paste", () => {
  // The trace in production showed the paste with numbers separated by
  // spaces rather than tabs.
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "one\ntwo\nthree");

  const result = fs.replaceInFile("/test.txt", "1 one\n2 two\n3 three", "reset");

  expect(result).toContain("Replaced 1 occurrence of the string in /test.txt");
  expect(result).toContain("stripping them");
  expect(fs.readFile("/test.txt")).toBe("reset");
});

test("replaceInFile recovers a numbered paste with a view_range offset", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "l1\nl2\nl3\nl4\nl5");

  // viewFile("/test.txt", [3, -1]) renders: 3\tl3\n4\tl4\n5\tl5
  const result = fs.replaceInFile("/test.txt", "3 l3\n4 l4\n5 l5", "mid");

  expect(result).toContain("Replaced 1 occurrence of the string in /test.txt");
  expect(fs.readFile("/test.txt")).toBe("l1\nl2\nmid");
});

test("replaceInFile ambiguous numbered paste reports the raw-content matches", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "head\nseg\nseg\nseg\ntail\nseg\nseg\nseg");

  const result = fs.replaceInFile("/test.txt", "1 seg\n2 seg\n3 seg", "x");

  expect(result).toContain("Error: Found 2 occurrences");
  expect(result).toContain("does your edit target one of them?");
  expect(fs.readFile("/test.txt")).toBe("head\nseg\nseg\nseg\ntail\nseg\nseg\nseg");
});

test("replaceInFile oversized old_str steers to create+overwrite", () => {
  // Whole-file rewrites sent as str_replace are fragile and waste steps;
  // the tool must point at the create/overwrite instrument instead.
  const fs = new VirtualFileSystem();
  const content = Array.from({ length: 60 }, (_, i) => `line number ${i} with padding text`).join("\n");
  fs.createFile("/test.txt", content);

  // ≥ max(800, 50% of file) — a near-full old_str with one missing line.
  const nearFull = content.split("\n").slice(0, 55).join("\n");
  const result = fs.replaceInFile("/test.txt", nearFull, "new file body");

  expect(result).toContain("covers most of /test.txt");
  expect(result).toContain('create\' command with "overwrite": true');
  expect(fs.readFile("/test.txt")).toBe(content);
});

test("replaceInFile does not flag short strings as file rewrites", () => {
  const fs = new VirtualFileSystem();
  const content = "x".repeat(900);
  fs.createFile("/test.txt", content);

  const result = fs.replaceInFile("/test.txt", "900 padding suffix marker!", "y");

  expect(result).toContain("Error: String not found in file");
  expect(fs.readFile("/test.txt")).toBe(content);
});

test("replaceInFile returns error for non-existent file", () => {
  const fs = new VirtualFileSystem();

  const result = fs.replaceInFile("/nonexistent.txt", "foo", "bar");
  expect(result).toBe("Error: File not found: /nonexistent.txt");
});

test("replaceInFile returns error for directory", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");

  const result = fs.replaceInFile("/src", "foo", "bar");
  expect(result).toBe("Error: Cannot edit a directory: /src");
});

test("replaceInFile returns error when string not found", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "hello world");

  const result = fs.replaceInFile("/test.txt", "foo", "bar");

  expect(result).toContain('Error: String not found in file: "foo"');
  expect(result).toContain("copy old_str verbatim");
  expect(result).not.toContain("Closest lines");
});

test("replaceInFile not-found error suggests closest lines when tokens overlap", () => {
  // A miss built from memory (wrong class order) versus the line that is
  // actually in the file: high token overlap, zero literal match.
  const fs = new VirtualFileSystem();
  fs.createFile(
    "/test.txt",
    [
      "export default function App() {",
      "  return (",
      '    <button className="rounded bg-orange-500 px-4 py-2 text-white transition-colors hover:bg-orange-600">',
      "      Count",
      "    </button>",
      "  );",
      "}",
    ].join("\n")
  );

  const result = fs.replaceInFile(
    "/test.txt",
    'class="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 focus-visible:ring-2"',
    "replaced"
  );

  expect(result).toContain("Error: String not found in file");
  expect(result).toContain("Closest lines currently in /test.txt");
  expect(result).toContain("line 3:");
  expect(result).toContain("bg-orange-500");
  // File unchanged while ambiguous.
  expect(fs.readFile("/test.txt")).toContain("rounded bg-orange-500");
});

test("replaceInFile not-found error without token overlap lists no lines", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "alpha beta gamma");

  const result = fs.replaceInFile("/test.txt", "completely different here", "x");

  expect(result).toContain("Error: String not found in file");
  expect(result).not.toContain("Closest lines");
});

test("replaceInFile rejects empty old_str with a clear message", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "alpha");

  const result = fs.replaceInFile("/test.txt", "", "x");

  expect(result).toBe("Error: old_str must not be empty.");
});

test("insertInFile inserts text at specified line", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "line1\nline2\nline3");

  const result = fs.insertInFile("/test.txt", 1, "inserted");

  expect(result).toBe("Text inserted at line 1 in /test.txt");
  expect(fs.readFile("/test.txt")).toBe("line1\ninserted\nline2\nline3");
});

test("insertInFile inserts at beginning", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "line1\nline2");

  const result = fs.insertInFile("/test.txt", 0, "first");

  expect(result).toBe("Text inserted at line 0 in /test.txt");
  expect(fs.readFile("/test.txt")).toBe("first\nline1\nline2");
});

test("insertInFile inserts at end", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "line1\nline2");

  const result = fs.insertInFile("/test.txt", 2, "last");

  expect(result).toBe("Text inserted at line 2 in /test.txt");
  expect(fs.readFile("/test.txt")).toBe("line1\nline2\nlast");
});

test("insertInFile returns error for invalid line number", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "line1\nline2");

  const result = fs.insertInFile("/test.txt", 5, "text");
  expect(result).toBe("Error: Invalid line number: 5. File has 2 lines.");

  const negativeResult = fs.insertInFile("/test.txt", -1, "text");
  expect(negativeResult).toBe(
    "Error: Invalid line number: -1. File has 2 lines."
  );
});

test("insertInFile returns error for non-existent file", () => {
  const fs = new VirtualFileSystem();

  const result = fs.insertInFile("/nonexistent.txt", 0, "text");
  expect(result).toBe("Error: File not found: /nonexistent.txt");
});

test("insertInFile returns error for directory", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");

  const result = fs.insertInFile("/src", 0, "text");
  expect(result).toBe("Error: Cannot edit a directory: /src");
});

test("rename moves a file to a new location", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");

  const result = fs.rename("/test.txt", "/renamed.txt");

  expect(result).toBe(true);
  expect(fs.exists("/test.txt")).toBe(false);
  expect(fs.exists("/renamed.txt")).toBe(true);
  expect(fs.readFile("/renamed.txt")).toBe("content");
});

test("rename moves a file to a different directory", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");
  fs.createDirectory("/docs");

  const result = fs.rename("/test.txt", "/docs/test.txt");

  expect(result).toBe(true);
  expect(fs.exists("/test.txt")).toBe(false);
  expect(fs.exists("/docs/test.txt")).toBe(true);
  expect(fs.readFile("/docs/test.txt")).toBe("content");
});

test("rename creates parent directories if they don't exist", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");

  const result = fs.rename("/test.txt", "/new/path/to/file.txt");

  expect(result).toBe(true);
  expect(fs.exists("/test.txt")).toBe(false);
  expect(fs.exists("/new")).toBe(true);
  expect(fs.exists("/new/path")).toBe(true);
  expect(fs.exists("/new/path/to")).toBe(true);
  expect(fs.exists("/new/path/to/file.txt")).toBe(true);
  expect(fs.readFile("/new/path/to/file.txt")).toBe("content");
});

test("rename moves a directory and all its contents", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");
  fs.createFile("/src/index.ts", "index content");
  fs.createDirectory("/src/components");
  fs.createFile("/src/components/Button.tsx", "button content");

  const result = fs.rename("/src", "/app");

  expect(result).toBe(true);
  expect(fs.exists("/src")).toBe(false);
  expect(fs.exists("/app")).toBe(true);
  expect(fs.exists("/app/index.ts")).toBe(true);
  expect(fs.exists("/app/components")).toBe(true);
  expect(fs.exists("/app/components/Button.tsx")).toBe(true);
  expect(fs.readFile("/app/index.ts")).toBe("index content");
  expect(fs.readFile("/app/components/Button.tsx")).toBe("button content");
});

test("rename moves a directory to a nested location with parent creation", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");
  fs.createFile("/src/file.txt", "content");

  const result = fs.rename("/src", "/deeply/nested/src");

  expect(result).toBe(true);
  expect(fs.exists("/src")).toBe(false);
  expect(fs.exists("/deeply")).toBe(true);
  expect(fs.exists("/deeply/nested")).toBe(true);
  expect(fs.exists("/deeply/nested/src")).toBe(true);
  expect(fs.exists("/deeply/nested/src/file.txt")).toBe(true);
  expect(fs.readFile("/deeply/nested/src/file.txt")).toBe("content");
});

test("rename returns false when source doesn't exist", () => {
  const fs = new VirtualFileSystem();

  const result = fs.rename("/nonexistent.txt", "/new.txt");

  expect(result).toBe(false);
  expect(fs.exists("/new.txt")).toBe(false);
});

test("rename returns false when destination already exists", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/source.txt", "source content");
  fs.createFile("/dest.txt", "dest content");

  const result = fs.rename("/source.txt", "/dest.txt");

  expect(result).toBe(false);
  expect(fs.exists("/source.txt")).toBe(true);
  expect(fs.readFile("/source.txt")).toBe("source content");
  expect(fs.readFile("/dest.txt")).toBe("dest content");
});

test("rename returns false when trying to rename root directory", () => {
  const fs = new VirtualFileSystem();

  const result = fs.rename("/", "/root");

  expect(result).toBe(false);
  expect(fs.exists("/")).toBe(true);
  expect(fs.exists("/root")).toBe(false);
});

test("rename returns false when destination is root", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");

  const result = fs.rename("/test.txt", "/");

  expect(result).toBe(false);
  expect(fs.exists("/test.txt")).toBe(true);
});

test("rename handles complex directory structure move", () => {
  const fs = new VirtualFileSystem();
  // Create complex structure
  fs.createDirectory("/project");
  fs.createDirectory("/project/src");
  fs.createDirectory("/project/src/components");
  fs.createDirectory("/project/src/utils");
  fs.createFile("/project/src/index.ts", "main");
  fs.createFile("/project/src/components/App.tsx", "app");
  fs.createFile("/project/src/components/Button.tsx", "button");
  fs.createFile("/project/src/utils/helpers.ts", "helpers");
  fs.createFile("/project/README.md", "readme");

  const result = fs.rename("/project", "/new-project");

  expect(result).toBe(true);
  expect(fs.exists("/project")).toBe(false);
  expect(fs.exists("/new-project/src/components/App.tsx")).toBe(true);
  expect(fs.exists("/new-project/src/utils/helpers.ts")).toBe(true);
  expect(fs.readFile("/new-project/src/index.ts")).toBe("main");
  expect(fs.readFile("/new-project/README.md")).toBe("readme");
});

test("rename preserves file content and directory structure", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/data");
  fs.createFile("/data/users.json", '{"users": []}');
  fs.createFile("/data/config.json", '{"version": "1.0"}');

  const result = fs.rename("/data", "/backup/2024/data");

  expect(result).toBe(true);
  expect(fs.exists("/backup")).toBe(true);
  expect(fs.exists("/backup/2024")).toBe(true);
  expect(fs.exists("/backup/2024/data")).toBe(true);
  expect(fs.readFile("/backup/2024/data/users.json")).toBe('{"users": []}');
  expect(fs.readFile("/backup/2024/data/config.json")).toBe('{"version": "1.0"}');
});

test("rename handles special characters in paths", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test file.txt", "content with spaces");

  const result = fs.rename("/test file.txt", "/docs/test-file.txt");

  expect(result).toBe(true);
  expect(fs.exists("/test file.txt")).toBe(false);
  expect(fs.exists("/docs/test-file.txt")).toBe(true);
  expect(fs.readFile("/docs/test-file.txt")).toBe("content with spaces");
});

test("rename normalizes paths correctly", () => {
  const fs = new VirtualFileSystem();
  fs.createFile("/test.txt", "content");

  const result = fs.rename("test.txt", "//new//path//file.txt");

  expect(result).toBe(true);
  expect(fs.exists("/test.txt")).toBe(false);
  expect(fs.exists("/new/path/file.txt")).toBe(true);
});

test("rename handles empty directories", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/empty-dir");

  const result = fs.rename("/empty-dir", "/moved-empty-dir");

  expect(result).toBe(true);
  expect(fs.exists("/empty-dir")).toBe(false);
  expect(fs.exists("/moved-empty-dir")).toBe(true);
  expect(fs.getNode("/moved-empty-dir")?.type).toBe("directory");
});

test("normalizePath resolves .. segments correctly", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/a/../b.txt", "content");
  expect(fs.exists("/b.txt")).toBe(true);
  expect(fs.exists("/a/b.txt")).toBe(false);

  fs.createFile("/c/../d.txt", "content");
  expect(fs.exists("/d.txt")).toBe(true);

  fs.createFile("/a/../../e.txt", "content");
  expect(fs.exists("/e.txt")).toBe(true);
  expect(fs.exists("/a/e.txt")).toBe(false);
});

test("normalizePath collapses .. that escape the root to root", () => {
  const fs = new VirtualFileSystem();

  fs.createFile("/../x.txt", "content");
  expect(fs.exists("/x.txt")).toBe(true);

  fs.createFile("/a/..", "content");
  expect(fs.exists("/")).toBe(true);
});

test("rename into its own subtree is rejected without crashing", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/a");
  fs.createFile("/a/b.txt", "content");

  expect(() => fs.rename("/a", "/a/renamed")).not.toThrow();
  const result = fs.rename("/a", "/a/renamed");
  expect(result).toBe(false);
  expect(fs.exists("/a")).toBe(true);
  expect(fs.exists("/a/b.txt")).toBe(true);

  expect(() => fs.rename("/a", "/a/sub")).not.toThrow();
  expect(fs.rename("/a", "/a/sub")).toBe(false);
});

test("rename /src into /src/components is rejected without stack overflow", () => {
  const fs = new VirtualFileSystem();
  fs.createDirectory("/src");
  fs.createFile("/src/App.jsx", "content");

  expect(() => fs.rename("/src", "/src/components")).not.toThrow();
  expect(fs.rename("/src", "/src/components")).toBe(false);
  expect(fs.exists("/src/App.jsx")).toBe(true);
});
