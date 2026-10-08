"use client";

import { createZipBlob, triggerBlobDownload } from "@/lib/download-zip";

// Builds a runnable Storybook 9 (react-vite) project from the virtual file
// system contents: the generated JSX sources are copied into src/, @/ imports
// are rewritten to relative paths, and a CSF story is generated for /App.jsx
// (or /App.tsx) plus every /components/*.{jsx,tsx} file.

const SB_VERSION = "9.1.15"; // match what the scaffold itself was verified against

// Story imports need a valid JS identifier; generated files may be named in
// any casing (e.g. `my-comp.jsx`), so fall back to a safe binding name while
// keeping the readable title separate.
const RESERVED_WORDS = /^(await|break|case|catch|class|const|continue|default|delete|do|else|enum|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)$/;

function asIdentifier(name: string): string | null {
  if (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED_WORDS.test(name)) {
    return null;
  }
  return name;
}

// '/components/Foo.jsx' -> ['Foo.jsx', '/components/Foo.jsx']
function componentName(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.[^.]+$/, "");
}

// Detect the default-exported component name in a source file. Handles the
// styles the generation prompt allows:
//   export default function Foo() {}   export default Foo;
//   const Foo = ...; export default Foo;
// Returns null when no valid-identifier name can be detected (the file name
// may not be usable as an identifier either, e.g. `my-comp.jsx`).
function defaultExportName(source: string): string | null {
  const patterns = [
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/,
    /export\s+default\s+class\s+([A-Za-z_$][\w$]*)/,
    /export\s+default\s+(?!function\b|class\b)([A-Za-z_$][\w$]*)/,
  ];
  for (const re of patterns) {
    const m = source.match(re);
    if (m) return m[1];
  }
  return null;
}

export type StorybookProject = Map<string, string>;

interface ComponentEntry {
  // storybook project path, e.g. src/App.jsx or src/components/Foo.jsx
  destPath: string;
  importPath: string; // specifier to use from stories
  name: string; // valid component identifier for the story import
  title: string; // human-readable title (may not be an identifier)
  content: string;
}

// Rewrite '@/...' import specifiers to relative paths from the importing
// file's Storybook-project location. VFS paths are '/'-rooted; Storybook
// sources live under src/. Covers static, side-effect, and dynamic imports.
function rewriteAliases(content: string, vfsPath: string): string {
  const dest = `src/${vfsPath.slice(1)}`;
  const fromDir = dest.includes("/") ? dest.slice(0, dest.lastIndexOf("/")) : "src";
  const depth = fromDir.split("/").length - 1; // components under src/ need ../
  const root = depth === 0 ? "./" : "../".repeat(depth) + "src/";
  return content.replace(
    /(from\s+|import\s*\(?\s*)['"]@\/([^'"]+)['"]/g,
    (_m, kw, spec) => `${kw}'${root}${spec}'`
  );
}

function isEntry(path: string): boolean {
  return path === "/App.jsx" || path === "/App.tsx";
}

function isComponent(path: string): boolean {
  return /^\/components\/[^/]+\.(jsx|tsx)$/.test(path);
}

const COMPONENT_SOURCE_RE = /\.(jsx|tsx)$/;

function collectComponents(files: Map<string, string>): ComponentEntry[] {
  const entries: ComponentEntry[] = [];
  for (const [path, content] of files) {
    if (!isEntry(path) && !isComponent(path)) continue;
    if (!COMPONENT_SOURCE_RE.test(path)) continue;
    const ident = defaultExportName(content) ?? asIdentifier(componentName(path)) ?? "Component";
    const title = componentName(path);
    entries.push({
      destPath: `src/${path.slice(1)}`,
      importPath: `../${path.slice(1).replace(/\.[^.]+$/, "")}`,
      name: ident,
      title,
      content: rewriteAliases(content, path),
    });
  }
  return entries;
}

function storyFile(entry: ComponentEntry): string {
  return [
    `import ${entry.name} from '${entry.importPath}';`,
    "",
    "export default {",
    `  title: '${entry.title.replace(/([a-z0-9])([A-Z])/g, "$1 $2")}',`,
    "  component: " + entry.name + ",",
    "};",
    "",
    `export const Default = {};`,
    "",
  ].join("\n");
}

function packageJson(): string {
  const pkg = {
    name: "uigen-storybook-export",
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      storybook: "storybook dev -p 6006",
      "build-storybook": "storybook build",
    },
    dependencies: {
      react: "^19.2.0",
      "react-dom": "^19.2.0",
    },
    devDependencies: {
      "@tailwindcss/vite": "^4.1.14",
      "@vitejs/plugin-react": "^5.0.4",
      storybook: `^${SB_VERSION}`,
      "@storybook/react-vite": `^${SB_VERSION}`,
      tailwindcss: "^4.1.14",
      vite: "^7.1.11",
    },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function scaffoldFiles(): [string, string][] {
  return [
    ["package.json", packageJson()],
    [".gitignore", "node_modules/\ndist/\nstorybook-static/\n"],
    [
      "vite.config.js",
      [
        "import { defineConfig } from 'vite';",
        "import react from '@vitejs/plugin-react';",
        "import tailwindcss from '@tailwindcss/vite';",
        "",
        "export default defineConfig({",
        "  plugins: [react(), tailwindcss()],",
        "});",
        "",
      ].join("\n"),
    ],
    ["src/index.css", '@import "tailwindcss";\n'],
    [
      ".storybook/main.js",
      [
        "export default {",
        "  framework: '@storybook/react-vite',",
        "  stories: ['../src/**/*.stories.@(js|jsx)'],",
        "};",
        "",
      ].join("\n"),
    ],
    [
      ".storybook/preview.js",
      "import '../src/index.css';\n",
    ],
  ];
}

export function buildStorybookProject(files: Map<string, string>): StorybookProject {
  const out = new Map<string, string>();

  const entries = collectComponents(files);

  for (const [path, content] of files) {
    if (isEntry(path) || isComponent(path)) {
      continue;
    }
    // Support files the AI may have created (e.g. /lib/util.jsx): copy
    // verbatim under src/ so aliases keep resolving.
    const dest = `src/${path.slice(1)}`;
    out.set(dest, rewriteAliases(content, path));
  }

  for (const entry of entries) {
    out.set(entry.destPath, entry.content);
  }

  for (const entry of entries) {
    const story = componentName(entry.destPath.replace(/^src\/(components\/)?/, ""));
    out.set(`src/stories/${story}.stories.jsx`, storyFile(entry));
  }

  for (const [path, content] of scaffoldFiles()) {
    out.set(path, content);
  }

  return out;
}

export function downloadStorybookProjectZip(
  files: Map<string, string>,
  filename = "project-storybook.zip"
) {
  const blob = createZipBlob(buildStorybookProject(files));
  triggerBlobDownload(blob, filename);
}
