import * as Babel from "@babel/standalone";

/**
 * Result of transforming a single JSX/TSX file.
 */
export interface TransformResult {
  /** The transformed JavaScript code */
  code: string;
  /** Error message if transformation failed */
  error?: string;
  /** Set of import specifiers found in the file */
  missingImports?: Set<string>;
  /** Set of CSS import paths found in the file */
  cssImports?: Set<string>;
}

// Simple hash function for cache keys (not cryptographic, just for dedup)
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// Cache for transformed code: key = hash(filename + code), value = TransformResult
const transformCache = new Map<string, TransformResult>();
const TRANSFORM_CACHE_MAX_SIZE = 200;

function getTransformCacheKey(filename: string, code: string): string {
  return `${filename}:${hashString(code)}`;
}

function pruneTransformCache(): void {
  if (transformCache.size > TRANSFORM_CACHE_MAX_SIZE) {
    // Remove oldest entries (first 20% of the map)
    const keysToDelete = Array.from(transformCache.keys()).slice(0, Math.floor(TRANSFORM_CACHE_MAX_SIZE * 0.2));
    for (const key of keysToDelete) {
      transformCache.delete(key);
    }
  }
}

function createPlaceholderModule(componentName: string): string {
  return `
import React from 'react';
const ${componentName} = function() {
  return React.createElement('div', {}, null);
}
export default ${componentName};
export { ${componentName} };
`;
}

/**
 * Transforms JSX/TSX code to JavaScript using Babel.
 * Results are cached by filename + code hash for performance.
 *
 * @param code - The source code to transform
 * @param filename - The filename (used to determine TypeScript vs JavaScript)
 * @param existingFiles - Set of existing file paths (for import resolution)
 * @returns Transform result with code, imports, and any errors
 */
export function transformJSX(
  code: string,
  filename: string,
  existingFiles: Set<string>
): TransformResult {
  // Check cache first
  const cacheKey = getTransformCacheKey(filename, code);
  const cached = transformCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let result: TransformResult;
  try {
    const isTypeScript = filename.endsWith(".ts") || filename.endsWith(".tsx");

    let processedCode = code;
    const importRegex =
      /import\s+(?:{[^}]+}|[^,\s]+)?\s*(?:,\s*{[^}]+})?\s+from\s+['"]([^'"]+)['"]/g;
    const imports = new Set<string>();
    const cssImports = new Set<string>();

    const cssImportRegex = /import\s+['"]([^'"]+\.css)['"]/g;
    let cssMatch;
    while ((cssMatch = cssImportRegex.exec(code)) !== null) {
      cssImports.add(cssMatch[1]);
    }

    processedCode = processedCode.replace(cssImportRegex, '');

    // Auto-inject `import React from 'react'` when the code references the
    // React namespace without importing it first. Models commonly emit
    // `React.useState`, `React.createElement`, or `<React.Fragment>` without
    // an import, which crashed the preview with "React is not defined".
    const hasReactImport = /(?:from\s*|import\s+)\s*['"]react['"]/.test(processedCode);
    const usesReactNs = /\bReact\s*[.(]/.test(processedCode);
    if (!hasReactImport && usesReactNs) {
      processedCode = `import React from 'react';\n${processedCode}`;
    }

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      if (!match[1].endsWith('.css')) {
        imports.add(match[1]);
      }
    }

    const transformed = Babel.transform(processedCode, {
      filename,
      presets: [
        ["react", { runtime: "automatic" }],
        ...(isTypeScript ? ["typescript"] : []),
      ],
      plugins: [],
    });

    result = {
      code: transformed.code || "",
      missingImports: imports,
      cssImports: cssImports,
    };
  } catch (error) {
    result = {
      code: "",
      error: error instanceof Error ? error.message : "Unknown transform error",
    };
  }

  // Cache the result
  transformCache.set(cacheKey, result);
  pruneTransformCache();

  return result;
}

function resolveRelativePath(fromDir: string, relativePath: string): string {
  const parts = fromDir.split("/").filter(Boolean);
  const relParts = relativePath.split("/");

  for (const part of relParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return "/" + parts.join("/");
}

function normalizeModulePath(imp: string, fromFile: string): string {
  if (imp.startsWith("@/")) {
    return imp.replace("@/", "/");
  }
  if (imp.startsWith("./") || imp.startsWith("../")) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/")) || "/";
    return resolveRelativePath(fromDir, imp);
  }
  if (imp.startsWith("/")) return imp;
  return imp;
}

function isLocalImport(imp: string): boolean {
  return imp.startsWith(".") || imp.startsWith("/") || imp.startsWith("@/");
}

function formatNamedBindings(bindings: Map<string, Set<string>>): string {
  const parts: string[] = [];
  for (const [exported, aliases] of bindings) {
    for (const alias of aliases) {
      parts.push(exported === alias ? exported : `${exported} as ${alias}`);
    }
  }
  return parts.join(", ");
}

function isCdnImport(imp: string): boolean {
  return !isLocalImport(imp);
}

interface FileExport {
  hasDefault: boolean;
  defaultExpr?: string;
  named: string[];
}

function analyzeExports(code: string): FileExport {
  const info: FileExport = { hasDefault: false, named: [] };

  // Check for export default async function/class Name (and anonymous async)
  const asyncDefaultMatch = code.match(
    /export\s+default\s+async\s+(?:function|class)\b(?:\s+(\w+))?/
  );
  if (asyncDefaultMatch) {
    info.hasDefault = true;
    info.defaultExpr = asyncDefaultMatch[1] ?? "__uigenDefault";
  }

  // Check for export default function/class Name
  const defaultFuncMatch = code.match(/export\s+default\s+(function|class)\s+(\w+)/);
  if (defaultFuncMatch) {
    info.hasDefault = true;
    info.defaultExpr = defaultFuncMatch[2];
  }

  // Check for anonymous export default function/class
  const anonymousFuncMatch = code.match(/export\s+default\s+(?:async\s+)?(function|class)\s*\(/);
  if (anonymousFuncMatch) {
    info.hasDefault = true;
    info.defaultExpr = "__uigenDefault";
  }

  // Check for export default const Name =
  const defaultConstMatch = code.match(/export\s+default\s+(const|let|var)\s+(\w+)\s*=/);
  if (defaultConstMatch) {
    info.hasDefault = true;
    info.defaultExpr = defaultConstMatch[2];
  }

  // Check for export default <expr> (any other default export: identifier
  // references, arrows, objects, etc.). The bundler rewrites these into a
  // synthetic `const __uigenDefault = ...`, so the expression name always
  // resolves to __uigenDefault.
  const defaultRefMatch = code.match(/export\s+default\s+(?!function|class|const|let|var)([\s\S]*?);?\s*$/);
  if (defaultRefMatch) {
    info.hasDefault = true;
    info.defaultExpr = "__uigenDefault";
  }

  // Named exports: export function X, export const X, export class X
  const namedFuncMatch = code.match(/export\s+(function|const|let|var|class)\s+(\w+)/g);
  if (namedFuncMatch) {
    for (const m of namedFuncMatch) {
      const nameMatch = m.match(/\w+$/);
      if (nameMatch) info.named.push(nameMatch[0]);
    }
  }

  // export { X, Y }
  const namedListMatch = code.match(/export\s+\{\s*([\s\S]*?)\s*\}/);
  if (namedListMatch) {
    const items = namedListMatch[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim());
    info.named.push(...items.filter(Boolean));
  }

  return info;
}

export function createBundleFromFiles(files: Map<string, string>): {
  code: string;
  styles: string;
  errors: Array<{ path: string; error: string }>;
} {
  const transformed = new Map<string, string>();
  const errors: Array<{ path: string; error: string }> = [];
  let collectedStyles = "";
  const filePaths = new Set(files.keys());

  // First pass: transform all JS/TS files
  for (const [path, content] of files) {
    if (
      path.endsWith(".js") ||
      path.endsWith(".jsx") ||
      path.endsWith(".ts") ||
      path.endsWith(".tsx")
    ) {
      const { code, error, cssImports } = transformJSX(content, path, filePaths);

      if (error) {
        errors.push({ path, error });
        continue;
      }

      transformed.set(path, code);

      if (cssImports) {
        cssImports.forEach((cssImport) => {
          const resolved = normalizeModulePath(cssImport, path);
          if (files.has(resolved)) {
            collectedStyles += `/* ${resolved} */\n${files.get(resolved)}\n\n`;
          }
        });
      }
    } else if (path.endsWith(".css")) {
      collectedStyles += `/* ${path} */\n${content}\n\n`;
    }
  }

  // Second pass: analyze and bundle (even if some files had errors)
  const parts: string[] = [];

  // Remove CSS imports from all transformed code
  // (Babel keeps them as import declarations, which won't resolve in a module context)
  const cssImportRemoveRegex = /import\s+['"][^'"]+\.css['"]\s*;?\s*/g;

  // Collect and merge CDN imports across all files to avoid duplicate bindings.
  // We parse each import by source module and merge bindings so that different
  // files importing different things from the same package are combined safely.
  // e.g. File A: `import React from 'react'` + File B: `import React, { useState } from 'react'`
  //   → `import React, { useState } from 'react'` (single import, no conflict)
  const mergedImports = new Map<string, {
    defaultBinding: string | null;
    namedBindings: Map<string, Set<string>>;
    namespaceBinding: string | null;
  }>();
  const sideEffectImports = new Set<string>();

  function parseAndCollectImports(code: string): void {
    const importRegex = /import\s+(?:{[^}]+}|[^,\s]+|\*\s+as\s+\w+)?\s*(?:,\s*(?:{[^}]+}|\*\s+as\s+\w+))?\s+from\s+['"]([^'"]+)['"]\s*;?\s*/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const source = match[1];
      if (isLocalImport(source) || source.endsWith('.css')) continue;

      const clause = match[0].trim();
      const defaultOnlyMatch = clause.match(/^import\s+(\w+)\s+from\s/);
      const namedMatch = clause.match(/^import\s+(?:(\w+)\s*,\s*)?\{\s*([^}]+)\s*\}\s+from\s/);
      const namespaceMatch = clause.match(/^import\s+(?:(\w+)\s*,\s*)?\*\s+as\s+(\w+)\s+from\s/);

      if (!mergedImports.has(source)) {
        mergedImports.set(source, { defaultBinding: null, namedBindings: new Map(), namespaceBinding: null });
      }
      const merged = mergedImports.get(source)!;

      if (namespaceMatch) {
        if (namespaceMatch[1]) merged.defaultBinding = namespaceMatch[1];
        merged.namespaceBinding = namespaceMatch[2];
      } else if (namedMatch) {
        if (namedMatch[1]) merged.defaultBinding = namedMatch[1];
        const members = namedMatch[2].split(',').map(s => s.trim()).filter(Boolean);
        for (const member of members) {
          const parts = member.split(/\s+as\s+/);
          const exported = parts[0].trim();
          const alias = parts[1]?.trim() || exported;
          // Keep every alias for an exported name: file A may import
          // `{ Button }` while file B imports `{ Button as Btn }`, and both
          // bindings must survive the merge.
          let aliases = merged.namedBindings.get(exported);
          if (!aliases) {
            aliases = new Set<string>();
            merged.namedBindings.set(exported, aliases);
          }
          aliases.add(alias);
        }
      } else if (defaultOnlyMatch) {
        merged.defaultBinding = defaultOnlyMatch[1];
      }
    }

    const sideEffectRegex = /import\s+['"]([^'"]+)['"]\s*;?\s*/g;
    while ((match = sideEffectRegex.exec(code)) !== null) {
      const source = match[1];
      if (!isLocalImport(source) && !source.endsWith('.css')) {
        sideEffectImports.add(source);
      }
    }
  }

  for (const [, code] of transformed) {
    parseAndCollectImports(code);
  }

  const cdnImportParts: string[] = [];
  for (const [source, info] of mergedImports) {
    const parts: string[] = ['import '];
    if (info.defaultBinding && info.namespaceBinding) {
      parts.push(`${info.defaultBinding}, * as ${info.namespaceBinding}`);
    } else if (info.defaultBinding) {
      parts.push(info.defaultBinding);
      if (info.namedBindings.size > 0) {
        parts.push(`, { ${formatNamedBindings(info.namedBindings)} }`);
      }
    } else if (info.namespaceBinding) {
      parts.push(`* as ${info.namespaceBinding}`);
    } else if (info.namedBindings.size > 0) {
      parts.push(`{ ${formatNamedBindings(info.namedBindings)} }`);
    }
    parts.push(` from '${source}';`);
    cdnImportParts.push(parts.join(''));
  }
  for (const source of sideEffectImports) {
    if (!mergedImports.has(source)) {
      cdnImportParts.push(`import '${source}';`);
    }
  }
  if (cdnImportParts.length > 0) {
    parts.push(cdnImportParts.join('\n'));
  }

  for (const [path, code] of transformed) {
    const pathTag = JSON.stringify(path);

    // Remove .css imports
    let rewritten = code.replace(cssImportRemoveRegex, "");

    // Remove ALL import statements (local and CDN) — CDN imports are
    // deduplicated and emitted once above
    rewritten = rewritten.replace(
      /import\s+(?:{[^}]*}|\w+(?:\s*,\s*{[^}]*})?|\*\s+as\s+\w+)?\s*(?:,\s*(?:{[^}]*}|\*\s+as\s+\w+))?\s*from\s+['"][^'"]+['"]\s*;?\s*/g,
      ""
    );
    rewritten = rewritten.replace(/import\s+['"][^'"]+['"]\s*;?\s*/g, "");

    // Strip all `export` keywords from declarations
    // export default function X -> function X
    rewritten = rewritten.replace(/export\s+default\s+(function|class)\s+(\w+)/g, "$1 $2");
    // export default async function X -> async function X (named only)
    rewritten = rewritten.replace(/export\s+default\s+async\s+(function|class)\s+(\w+)/g, "async $1 $2");
    // export default function/class (anonymous) -> const __uigenDefault = function/class
    rewritten = rewritten.replace(
      /export\s+default\s+async\s+(function|class)\s*\(/g,
      "const __uigenDefault = async $1("
    );
    rewritten = rewritten.replace(
      /export\s+default\s+(function|class)\s*\(/g,
      "const __uigenDefault = $1("
    );
    // export default const/let/var X = -> const/let/var X =
    rewritten = rewritten.replace(/export\s+default\s+(const|let|var)\s+(\w+)\s*=/g, "$1 $2 =");
    // export default <expr> (any other default: identifier refs, arrows,
    // objects, async arrows, etc.) -> const __uigenDefault = <expr>;
    rewritten = rewritten.replace(
      /export\s+default\s+(?!function|class|const|let|var)\s*([\s\S]*?);?\s*$/gm,
      "const __uigenDefault = $1;"
    );
    // export function X -> function X
    rewritten = rewritten.replace(/export\s+(function|class)\s+(\w+)/g, "$1 $2");
    // export const/let/var X -> const/let/var X
    rewritten = rewritten.replace(/export\s+(const|let|var)\s+(\w+)/g, "$1 $2");
    // export { X, Y } -> remove entirely
    rewritten = rewritten.replace(/export\s+\{[^}]*\};\s*/g, "");

    // Safety net: rewrite CommonJS patterns the AI sometimes emits
    // module.exports = X → const __moduleExports = X
    rewritten = rewritten.replace(
      /module\.exports\s*=\s*([^;]+);?\s*/g,
      "const __moduleExports = $1;"
    );
    // exports.X = Y → const __exports_X = Y
    rewritten = rewritten.replace(
      /exports\.(\w+)\s*=\s*([^;]+);?\s*/g,
      "const __exports_$1 = $2;"
    );

    parts.push(`// --- ${path} ---\n${rewritten}`);
  }

  // Find the entry point's default export name
  const entryCode = transformed.get("/App.jsx") || transformed.get("/App.tsx") || "";
  const entryExports = analyzeExports(entryCode);

  // At the end of the bundle, re-export the entry point component
  // for the host module script to import
  if (entryExports.defaultExpr) {
    parts.push(`
const __AppComponent = ${entryExports.defaultExpr};
export default __AppComponent;
export { __AppComponent as App };
`);
  } else {
    // Try App or fallback to first default export found
    parts.push(`
const __AppComponent = typeof App !== "undefined" ? App : undefined;
export default __AppComponent;
export { __AppComponent as App };
`);
  }

  return {
    code: parts.join("\n"),
    styles: collectedStyles,
    errors,
  };
}

/**
 * Creates an import map and bundled code from a set of files.
 * Handles local imports, CSS imports, and CDN imports (via esm.sh).
 *
 * @param files - Map of file paths to their content
 * @returns Object with importMap JSON, collected styles, syntax errors, and bundled code
 */
export function createImportMap(files: Map<string, string>): {
  importMap: string;
  styles: string;
  errors: Array<{ path: string; error: string }>;
  bundleCode: string;
} {
  const imports: Record<string, string> = {
    react: "https://esm.sh/react@19",
    "react-dom": "https://esm.sh/react-dom@19",
    "react-dom/client": "https://esm.sh/react-dom@19/client",
    "react/jsx-runtime": "https://esm.sh/react@19/jsx-runtime",
    "react/jsx-dev-runtime": "https://esm.sh/react@19/jsx-dev-runtime",
  };

  const existingFiles = new Set(files.keys());
  const allThirdPartyImports = new Set<string>();
  let collectedStyles = "";

  // Scan for third-party imports
  for (const [path, content] of files) {
    if (!path.endsWith(".js") && !path.endsWith(".jsx") && !path.endsWith(".ts") && !path.endsWith(".tsx")) continue;

    const importRegex =
      /import\s+(?:{[^}]+}|[^,\s]+)?\s*(?:,\s*{[^}]+})?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const imp = match[1];
      if (isCdnImport(imp) && !imp.endsWith(".css")) {
        const baseName = imp.split("/")[0].startsWith("@")
          ? imp.split("/").slice(0, 2).join("/")
          : imp.split("/")[0];
        if (!allThirdPartyImports.has(baseName)) {
          allThirdPartyImports.add(baseName);
          imports[imp] = `https://esm.sh/${imp}`;
        }
      }
    }

    // Side-effect imports (no `from` clause) also need import-map entries,
    // e.g. `import 'confetti'`.
    const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectRegex.exec(content)) !== null) {
      const imp = match[1];
      if (isCdnImport(imp) && !imp.endsWith(".css")) {
        const baseName = imp.split("/")[0].startsWith("@")
          ? imp.split("/").slice(0, 2).join("/")
          : imp.split("/")[0];
        if (!allThirdPartyImports.has(baseName)) {
          allThirdPartyImports.add(baseName);
          imports[imp] = `https://esm.sh/${imp}`;
        }
      }
    }
  }

  // Get bundled code
  const { code: bundleCode, styles, errors } = createBundleFromFiles(files);
  collectedStyles = styles;

  return {
    importMap: JSON.stringify({ imports }, null, 2),
    styles: collectedStyles,
    errors,
    bundleCode,
  };
}

function escapeScriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Markers that indicate a component intends to fill the whole viewport with
// its own background/layout. Such components must keep block layout so the
// background spans the full width; centering is applied only to smaller ones.
const FULL_SCREEN_RE =
  /\b(?:min-h-screen|h-screen|min-h-dvh|h-dvh|min-h-\[100vh\]|w-screen|min-w-screen)\b/;

/**
 * Detects whether a component intends to fill the entire viewport.
 * Used to determine whether to apply flex centering in the preview.
 *
 * @param content - The component source code
 * @returns True if the component uses viewport-filling classes
 */
export function isFullScreenComponent(content: string): boolean {
  return FULL_SCREEN_RE.test(content);
}

/**
 * Creates the complete HTML document for the preview iframe.
 * Includes import maps, bundled code, error boundaries, and Tailwind CSS.
 *
 * @param entryPoint - Path to the entry component (e.g., "/App.jsx")
 * @param importMap - JSON string of the import map
 * @param styles - Collected CSS styles from all files
 * @param errors - Array of syntax errors to display
 * @param bundleCode - The bundled JavaScript code
 * @param nonce - CSP nonce for script tags
 * @param centerComponent - Whether to apply flex centering to #root
 * @returns Complete HTML document string
 */
function createInspectionScript(nonce: string): string {
  return `<script${nonce ? ` nonce="${nonce}"` : ''}>
(function() {
  let inspectionEnabled = false;
  let elementMap = new Map();
  let labelCounts = new Map();
  let hoverOverlay = null;
  let hoverDebounceTimer = null;

  function toPascalCase(str) {
    return str.replace(/(\\s|-|_)(\\w)/g, function(_, __, c) { return c.toUpperCase(); })
              .replace(/^\\w/, function(c) { return c.toUpperCase(); })
              .replace(/\\s+/g, '');
  }

  function generateLabel(el) {
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return toPascalCase(ariaLabel) + toPascalCase(el.tagName.toLowerCase());

    var testId = el.getAttribute('data-testid');
    if (testId) return toPascalCase(testId);

    var text = '';
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'LABEL') {
      text = (el.textContent || '').trim().substring(0, 30);
    } else if (el.tagName.match(/^H[1-6]$/)) {
      text = (el.textContent || '').trim().substring(0, 30);
    } else if (el.tagName === 'INPUT') {
      text = el.getAttribute('placeholder') || el.getAttribute('type') || '';
    } else if (el.tagName === 'IMG') {
      text = el.getAttribute('alt') || '';
    }

    if (text) {
      var cleanText = text.replace(/[^a-zA-Z0-9\\s]/g, '').trim();
      if (cleanText.length > 0) {
        return toPascalCase(cleanText) + toPascalCase(el.tagName.toLowerCase());
      }
    }

    return toPascalCase(el.tagName.toLowerCase());
  }

  function buildElementMap() {
    elementMap.clear();
    labelCounts.clear();
    var root = document.getElementById('root');
    if (!root) return;

    var allElements = root.querySelectorAll('*');
    var idCounter = 0;
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      if (el === hoverOverlay) continue;
      var id = 'uigen-el-' + (idCounter++);
      el.setAttribute('data-uigen-id', id);
      var label = generateLabel(el);
      var count = labelCounts.get(label) || 0;
      labelCounts.set(label, count + 1);
      var displayLabel = count > 0 ? label + (count + 1) : label;
      elementMap.set(id, { el: el, label: label, displayLabel: displayLabel });
    }

    labelCounts.forEach(function(count, label) {
      if (count === 1) {
        elementMap.forEach(function(info) {
          if (info.label === label) info.displayLabel = label;
        });
      }
    });
  }

  function ensureOverlay() {
    if (hoverOverlay) return;
    hoverOverlay = document.createElement('div');
    hoverOverlay.id = '__uigen-hover-overlay';
    hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);border-radius:4px;transition:all 0.1s ease;display:none;';
    document.body.appendChild(hoverOverlay);
  }

  function showOverlay(el, label) {
    ensureOverlay();
    var rect = el.getBoundingClientRect();
    hoverOverlay.style.left = rect.left + 'px';
    hoverOverlay.style.top = rect.top + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
    hoverOverlay.style.display = 'block';

    var existingLabel = hoverOverlay.querySelector('[data-uigen-label]');
    if (!existingLabel) {
      existingLabel = document.createElement('div');
      existingLabel.setAttribute('data-uigen-label', 'true');
      existingLabel.style.cssText = 'position:absolute;top:-24px;left:0;background:#3b82f6;color:white;font-size:11px;padding:2px 6px;border-radius:3px;white-space:nowrap;font-family:system-ui;pointer-events:none;';
      hoverOverlay.appendChild(existingLabel);
    }
    existingLabel.textContent = '@' + label;
  }

  function hideOverlay() {
    if (hoverOverlay) hoverOverlay.style.display = 'none';
  }

  function postMsg(data) {
    try { parent.postMessage(data, '*'); } catch(e) {}
  }

  function handleMouseMove(e) {
    if (!inspectionEnabled) return;
    if (hoverDebounceTimer) clearTimeout(hoverDebounceTimer);
    hoverDebounceTimer = setTimeout(function() {
      var el = e.target;
      if (!el || el === hoverOverlay || el.id === '__uigen-hover-overlay') return;
      var id = el.getAttribute('data-uigen-id');
      if (!id) return;
      var info = elementMap.get(id);
      if (!info) return;
      showOverlay(el, info.displayLabel);
      postMsg({ type: 'uigen:element-hover', id: id, label: info.displayLabel, rect: el.getBoundingClientRect() });
    }, 50);
  }

  function handleClick(e) {
    if (!inspectionEnabled) return;
    var el = e.target;
    if (!el || el === hoverOverlay || el.id === '__uigen-hover-overlay') return;
    var id = el.getAttribute('data-uigen-id');
    if (!id) return;
    var info = elementMap.get(id);
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    postMsg({
      type: 'uigen:element-select',
      id: id,
      label: info.displayLabel,
      tagName: el.tagName.toLowerCase(),
      classes: el.className || '',
      textContent: (el.textContent || '').trim().substring(0, 100),
      rect: el.getBoundingClientRect()
    });
  }

  function handleParentMessage(e) {
    var data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'uigen:set-inspection-mode') {
      inspectionEnabled = !!data.enabled;
      if (inspectionEnabled) {
        buildElementMap();
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('click', handleClick, true);
      } else {
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        hideOverlay();
      }
    }
  }

  window.addEventListener('message', handleParentMessage);

  var observer = new MutationObserver(function() {
    if (inspectionEnabled) buildElementMap();
  });
  var rootEl = document.getElementById('root');
  if (rootEl) observer.observe(rootEl, { childList: true, subtree: true });
})();
</script>`;
}

export function createPreviewHTML(
  entryPoint: string,
  importMap: string,
  styles: string = "",
  errors: Array<{ path: string; error: string }> = [],
  bundleCode?: string,
  nonce?: string,
  centerComponent: boolean = true,
  theme: "light" | "dark" = "light"
): string {
  // Centering must not shrink a component that already fills the viewport:
  // a full-screen root (min-h-screen + background) relies on block layout to
  // span the whole width. Only apply flex centering to components that don't.
  const rootCentering = centerComponent
    ? `      /* Center generated components in the viewport. */
      display: flex;
      align-items: center;
      justify-content: center;
`
    : "";

  // The iframe runs in its own document, so it must opt into the app theme
  // explicitly. color-scheme keeps UA defaults (scrollbars, form controls)
  // consistent and the body background stops a white flash inside dark mode.
  const themeBody = theme === "dark"
    ? "background: #0e1518; color-scheme: dark;"
    : "background: #f8faf9; color-scheme: light;";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src ${nonce ? `'nonce-${nonce}'` : "'unsafe-inline'"} blob: https://cdn.tailwindcss.com https://esm.sh; style-src 'unsafe-inline' https://cdn.tailwindcss.com; connect-src blob: https://esm.sh https://cdn.tailwindcss.com; img-src https: data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ${themeBody}
    }
    #root {
      width: 100vw;
      height: 100vh;
${rootCentering}    }
    .error-boundary {
      color: red;
      padding: 1rem;
      border: 2px solid red;
      margin: 1rem;
      border-radius: 4px;
      background: #fee;
    }
    .error-stack {
      color: #7f1d1d;
      font-size: 12px;
      margin-top: 8px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow: auto;
    }
    .syntax-errors {
      background: #fef5f5;
      border: 2px solid #ff6b6b;
      border-radius: 12px;
      padding: 32px;
      margin: 24px;
      font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
      font-size: 14px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .syntax-errors h3 {
      color: #dc2626;
      margin: 0 0 20px 0;
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .syntax-errors .error-item {
      margin: 16px 0;
      padding: 16px;
      background: #fff;
      border-radius: 8px;
      border-left: 4px solid #ff6b6b;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    .syntax-errors .error-path {
      font-weight: 600;
      color: #991b1b;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .syntax-errors .error-message {
      color: #7c2d12;
      margin-top: 8px;
      white-space: pre-wrap;
      line-height: 1.5;
      font-size: 13px;
    }
    .syntax-errors .error-location {
      display: inline-block;
      background: #fee0e0;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      margin-left: 8px;
      color: #991b1b;
    }
  </style>
  ${styles ? `<style>\n${styles}</style>` : ''}
  <script type="importmap"${nonce ? ` nonce="${nonce}"` : ''}>
    ${importMap.replace(/</g, "\\u003c")}
  </script>
</head>
<body>
  ${errors.length > 0 ? `
    <div class="syntax-errors">
      <h3>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
          <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15h-2v-2h2v2zm0-4h-2V5h2v6z" fill="#dc2626"/>
        </svg>
        Syntax Error${errors.length > 1 ? 's' : ''} (${errors.length})
      </h3>
      ${errors.map(e => {
        const locationMatch = e.error.match(/\((\d+:\d+)\)/);
        const location = locationMatch ? locationMatch[1] : '';
        const cleanError = e.error.replace(/\(\d+:\d+\)/, '').trim();

        return `
        <div class="error-item">
          <div class="error-path">
            ${escapeHtml(e.path)}
            ${location ? `<span class="error-location">${escapeHtml(location)}</span>` : ''}
          </div>
          <div class="error-message">${escapeHtml(cleanError)}</div>
        </div>
      `;
      }).join('')}
    </div>
  ` : ''}
  <div id="root"></div>
  ${errors.length === 0 && !bundleCode ? `
    <div class="syntax-errors">
      <h3>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
          <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15h-2v-2h2v2zm0-4h-2V5h2v6z" fill="#dc2626"/>
        </svg>
        No renderable component
      </h3>
      <div class="error-item">
        <div class="error-path">No JavaScript/JSX component found</div>
        <div class="error-message">Add an App.jsx file that exports a default React component to see a preview here.</div>
      </div>
    </div>
  ` : ''}
  ${errors.length === 0 && bundleCode ? `
  <script${nonce ? ` nonce="${nonce}"` : ''}>
    const __bundleSrc = ${escapeScriptString(bundleCode)};
    const __blob = new Blob([__bundleSrc], {type: 'application/javascript'});
    window.__bundleUrl = URL.createObjectURL(__blob);
  </script>
  <script${nonce ? ` nonce="${nonce}"` : ''} type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';

    const __postError = (message, stack) => {
      try {
        parent.postMessage({ type: 'uigen:error', message: String(message), stack: stack ? String(stack) : '' }, '*');
      } catch (e) {}
    };

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, componentStack: null };
      }

      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }

      componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
        const stack = errorInfo && errorInfo.componentStack ? String(errorInfo.componentStack) : null;
        this.setState({ componentStack: stack });
        __postError(error && error.message ? error.message : String(error), stack);
      }

      render() {
        if (this.state.hasError) {
          const children = [
            React.createElement('h2', null, 'Something went wrong'),
            React.createElement('pre', null, this.state.error && this.state.error.toString ? this.state.error.toString() : String(this.state.error))
          ];
          if (this.state.componentStack) {
            children.push(React.createElement('pre', { className: 'error-stack' }, this.state.componentStack));
          }
          return React.createElement('div', { className: 'error-boundary' }, children);
        }
        return this.props.children;
      }
    }

    const __escapeHtml = (str) => str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

    window.addEventListener('error', (e) => {
      __postError(e && e.message ? e.message : 'Unknown script error', e && e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e && e.reason;
      __postError(reason && reason.message ? reason.message : String(reason), reason && reason.stack);
    });

    async function loadApp() {
      try {
        const mod = await import(window.__bundleUrl);
        URL.revokeObjectURL(window.__bundleUrl);
        const App = mod.default || mod.App;
        if (!App) {
          throw new Error('No default export or App export found in entry point');
        }
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(ErrorBoundary, null, React.createElement(App)));
      } catch (error) {
        if (window.__bundleUrl) URL.revokeObjectURL(window.__bundleUrl);
        console.error('Failed to load app:', error);
        __postError(error && error.message ? error.message : String(error), error && error.stack);
        document.getElementById('root').innerHTML = '<div class="error-boundary"><h2>Failed to load app</h2><pre>' + __escapeHtml(error && error.toString ? error.toString() : String(error)) + '</pre></div>';
      }
    }

    loadApp();
  </script>` : ''}
  ${createInspectionScript(nonce || '')}
</body>
</html>`;
}

/**
 * Validates all JSX/TSX files for syntax errors.
 *
 * @param files - Map of file paths to their content
 * @returns Array of errors with path and error message
 */
export function validateFiles(
  files: Map<string, string>
): Array<{ path: string; error: string }> {
  const errors: Array<{ path: string; error: string }> = [];
  const filePaths = new Set(files.keys());
  for (const [path, content] of files) {
    if (
      path.endsWith(".js") ||
      path.endsWith(".jsx") ||
      path.endsWith(".ts") ||
      path.endsWith(".tsx")
    ) {
      const { error } = transformJSX(content, path, filePaths);
      if (error) {
        errors.push({ path, error });
      }
    }
  }
  return errors;
}

export function createBlobURL(
  code: string,
  mimeType: string = "application/javascript"
): string {
  const blob = new Blob([code], { type: mimeType });
  return URL.createObjectURL(blob);
}
