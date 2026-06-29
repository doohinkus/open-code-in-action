import * as Babel from "@babel/standalone";

export interface TransformResult {
  code: string;
  error?: string;
  missingImports?: Set<string>;
  cssImports?: Set<string>;
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

export function transformJSX(
  code: string,
  filename: string,
  existingFiles: Set<string>
): TransformResult {
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

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      if (!match[1].endsWith('.css')) {
        imports.add(match[1]);
      }
    }

    const result = Babel.transform(processedCode, {
      filename,
      presets: [
        ["react", { runtime: "automatic" }],
        ...(isTypeScript ? ["typescript"] : []),
      ],
      plugins: [],
    });

    return {
      code: result.code || "",
      missingImports: imports,
      cssImports: cssImports,
    };
  } catch (error) {
    return {
      code: "",
      error: error instanceof Error ? error.message : "Unknown transform error",
    };
  }
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

  // Check for export default function/class Name
  const defaultFuncMatch = code.match(/export\s+default\s+(function|class)\s+(\w+)/);
  if (defaultFuncMatch) {
    info.hasDefault = true;
    info.defaultExpr = defaultFuncMatch[2];
  }

  // Check for export default const Name =
  const defaultConstMatch = code.match(/export\s+default\s+(const|let|var)\s+(\w+)\s*=/);
  if (defaultConstMatch) {
    info.hasDefault = true;
    info.defaultExpr = defaultConstMatch[2];
  }

  // Check for export default <expr> (where expr is a reference, not declaration)
  const defaultRefMatch = code.match(/export\s+default\s+(?!function|class|const|let|var)(\w+)/);
  if (defaultRefMatch) {
    info.hasDefault = true;
    info.defaultExpr = defaultRefMatch[1];
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

  for (const [path, code] of transformed) {
    const pathTag = JSON.stringify(path);

    // Remove .css imports
    let rewritten = code.replace(cssImportRemoveRegex, "");

    // Remove all import statements for local files (@/, /, ./, ../)
    rewritten = rewritten.replace(
      /import\s+(?:{[^}]*}|\w+(?:\s*,\s*{[^}]*})?)?\s*from\s+['"]((\.\.?\/|@\/|\/)[^'"]+)['"]\s*;?\s*/g,
      ""
    );
    rewritten = rewritten.replace(/import\s+['"]((\.\.?\/|@\/|\/)[^'"]+)['"]\s*;?\s*/g, "");

    // Strip all `export` keywords from declarations
    // export default function X -> function X
    rewritten = rewritten.replace(/export\s+default\s+(function|class)\s+(\w+)/g, "$1 $2");
    // export default const/let/var X = -> const/let/var X =
    rewritten = rewritten.replace(/export\s+default\s+(const|let|var)\s+(\w+)\s*=/g, "$1 $2 =");
    // export default <expr> (standalone expression/identifier) -> just the expr
    rewritten = rewritten.replace(/export\s+default\s+(?!function|class|const|let|var)\s*([\s\S]*?);?\s*$/gm, "$1");
    // export function X -> function X
    rewritten = rewritten.replace(/export\s+(function|class)\s+(\w+)/g, "$1 $2");
    // export const/let/var X -> const/let/var X
    rewritten = rewritten.replace(/export\s+(const|let|var)\s+(\w+)/g, "$1 $2");
    // export { X, Y } -> remove entirely
    rewritten = rewritten.replace(/export\s+\{[^}]*\};\s*/g, "");

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

export function createPreviewHTML(
  entryPoint: string,
  importMap: string,
  styles: string = "",
  errors: Array<{ path: string; error: string }> = [],
  bundleCode?: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #root {
      width: 100vw;
      height: 100vh;
    }
    .error-boundary {
      color: red;
      padding: 1rem;
      border: 2px solid red;
      margin: 1rem;
      border-radius: 4px;
      background: #fee;
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
  <script type="importmap">
    ${importMap}
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
            ${e.path}
            ${location ? `<span class="error-location">${location}</span>` : ''}
          </div>
          <div class="error-message">${cleanError.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>
      `;
      }).join('')}
    </div>
  ` : ''}
  <div id="root"></div>
  ${errors.length === 0 && bundleCode ? `
  <script>
    const __bundleSrc = ${JSON.stringify(bundleCode)};
    const __blob = new Blob([__bundleSrc], {type: 'application/javascript'});
    window.__bundleUrl = URL.createObjectURL(__blob);
  </script>
  <script type="module">
    import React from 'react';
    import ReactDOM from 'react-dom/client';

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }

      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }

      componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
      }

      render() {
        if (this.state.hasError) {
          return React.createElement('div', { className: 'error-boundary' },
            React.createElement('h2', null, 'Something went wrong'),
            React.createElement('pre', null, this.state.error?.toString())
          );
        }
        return this.props.children;
      }
    }

    async function loadApp() {
      try {
        const mod = await import(window.__bundleUrl);
        const App = mod.default || mod.App;
        if (!App) {
          throw new Error('No default export or App export found in entry point');
        }
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(ErrorBoundary, null, React.createElement(App)));
      } catch (error) {
        console.error('Failed to load app:', error);
        document.getElementById('root').innerHTML = '<div class="error-boundary"><h2>Failed to load app</h2><pre>' + error.toString().replace(/</g,'&lt;') + '</pre></div>';
      }
    }

    loadApp();
  </script>` : ''}
</body>
</html>`;
}

export function createBlobURL(
  code: string,
  mimeType: string = "application/javascript"
): string {
  const blob = new Blob([code], { type: mimeType });
  return URL.createObjectURL(blob);
}
