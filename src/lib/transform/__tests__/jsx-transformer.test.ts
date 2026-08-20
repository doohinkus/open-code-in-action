import { test, expect, vi } from "vitest";
import {
  transformJSX,
  createBlobURL,
  createImportMap,
  createPreviewHTML,
  createBundleFromFiles,
  isFullScreenComponent,
} from "../jsx-transformer";
import * as Babel from "@babel/standalone";

vi.mock("@babel/standalone", () => ({
  transform: vi.fn((code, options) => {
    let transformed = code;
    // Simulate real Babel behavior: add JSX runtime import when code uses JSX
    if (code.includes("<") && (code.includes(">") || code.includes("/>"))) {
      const jsxImport = `import { jsx as _jsx } from 'react/jsx-runtime';\n`;
      if (!transformed.includes(jsxImport)) {
        const importEnd = transformed.lastIndexOf("import") >= 0
          ? transformed.indexOf(";", transformed.lastIndexOf("import")) + 1
          : 0;
        if (importEnd > 0) {
          transformed = transformed.slice(0, importEnd) + "\n" + jsxImport + transformed.slice(importEnd).trim();
        } else {
          transformed = jsxImport + transformed;
        }
      }
    }
    if (options.filename?.endsWith(".tsx") || options.filename?.endsWith(".ts")) {
      transformed = transformed.replace(/const/g, "var");
    }
    return { code: transformed };
  }),
}));

global.URL.createObjectURL = vi.fn((blob) => {
  return `blob:mock-url-${Math.random()}`;
});

test("transformJSX transforms TypeScript files with correct presets", () => {
  const code = `const Component = () => <div>Hello</div>;`;
  const result = transformJSX(code, "test.tsx", new Set());

  expect(result.error).toBeUndefined();
  expect(result.code).toContain("import { jsx as _jsx } from 'react/jsx-runtime'");
  expect(result.code).toContain("var Component = () =>");
  expect(result.missingImports).toBeDefined();
});

test("transformJSX handles JavaScript files without TypeScript preset", () => {
  const code = `const Component = () => <div>Hello</div>;`;
  const result = transformJSX(code, "test.jsx", new Set());

  expect(result.error).toBeUndefined();
  expect(result.code).toContain("import { jsx as _jsx } from 'react/jsx-runtime'");
  expect(result.code).toContain("const Component = () =>");
  expect(result.missingImports).toBeDefined();
});

test("transformJSX collects imports from code", () => {
  const code = `
    import React from 'react';
    import { useState } from 'react';
    import Component from './Component';
    import { utils } from '../utils';
  `;
  const result = transformJSX(code, "test.jsx", new Set());

  expect(result.missingImports).toContain("react");
  expect(result.missingImports).toContain("./Component");
  expect(result.missingImports).toContain("../utils");
  expect(result.missingImports?.size).toBe(3);
});

test("transformJSX injects React import when code uses React namespace without importing it", () => {
  const code = `export default function Counter() {
  const [count, setCount] = React.useState(0);
  return <div>{count}</div>;
};`;
  const result = transformJSX(code, "App.jsx", new Set());

  expect(result.error).toBeUndefined();
  expect(result.code).toContain("import React from 'react'");
});

test("transformJSX does not inject React import when React is already imported", () => {
  const code = `import * as React from 'react';
export default function Counter() {
  const [count, setCount] = React.useState(0);
  return <div>{count}</div>;
};`;
  const result = transformJSX(code, "App.jsx", new Set());

  expect(result.error).toBeUndefined();
  expect(result.code).not.toMatch(/import React from 'react'/);
});

test("transformJSX handles transform errors gracefully", () => {
  vi.mocked(Babel.transform).mockImplementationOnce(() => {
    throw new Error("Transform failed");
  });

  const result = transformJSX("invalid code", "test.jsx", new Set());

  expect(result.code).toBe("");
  expect(result.error).toBe("Transform failed");

  vi.mocked(Babel.transform).mockReset();
});

test("createBlobURL creates blob with correct mime type", () => {
  const code = "console.log('test');";
  const url = createBlobURL(code);

  expect(URL.createObjectURL).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "application/javascript",
    })
  );
  expect(url).toMatch(/^blob:mock-url-/);
});

test("createBlobURL accepts custom mime type", () => {
  const code = "body { color: red; }";
  createBlobURL(code, "text/css");

  expect(URL.createObjectURL).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "text/css",
    })
  );
});

test("createImportMap includes React CDN imports", () => {
  const files = new Map();
  const result = createImportMap(files);
  const parsed = JSON.parse(result.importMap);

  expect(parsed.imports).toHaveProperty("react", "https://esm.sh/react@19");
  expect(parsed.imports).toHaveProperty("react-dom", "https://esm.sh/react-dom@19");
  expect(parsed.imports).toHaveProperty("react-dom/client", "https://esm.sh/react-dom@19/client");
  expect(parsed.imports).toHaveProperty("react/jsx-runtime", "https://esm.sh/react@19/jsx-runtime");
});

test("createImportMap transforms JavaScript and TypeScript files", () => {
  const files = new Map([
    ["/App.jsx", "export default function App() { return <div>App</div>; }"],
    ["/utils.ts", "export const helper = () => {};"],
    ["/styles.css", "body { margin: 0; }"],
  ]);

  const result = createImportMap(files);

  // Import map no longer contains blob URLs for user files — only CDN entries
  const parsed = JSON.parse(result.importMap);
  expect(parsed.imports["/App.jsx"]).toBeUndefined();
  expect(parsed.imports["react"]).toBeDefined();

  // Bundle code should contain the transformed files
  expect(result.bundleCode).toBeDefined();
  expect(result.bundleCode).toContain("App.jsx");
  expect(result.bundleCode).toContain("utils.ts");
});

test("createImportMap creates bundle code with all files", () => {
  const files = new Map([
    ["/components/Button.jsx", "export default function Button() {}"],
  ]);

  const result = createImportMap(files);

  expect(result.bundleCode).toBeDefined();
  expect(result.bundleCode).toContain("components/Button.jsx");
});

test("createImportMap collects CSS files and returns styles", () => {
  const files = new Map([
    ["/App.jsx", `import './styles.css'; export default function App() {}`],
    ["/styles.css", `body { margin: 0; } .container { padding: 20px; }`],
    ["/globals.css", `* { box-sizing: border-box; }`],
  ]);

  const result = createImportMap(files);

  expect(result).toHaveProperty("importMap");
  expect(result).toHaveProperty("styles");
  expect(result.styles).toContain("body { margin: 0; }");
  expect(result.styles).toContain("* { box-sizing: border-box; }");
});

test("createImportMap resolves CSS import paths correctly", () => {
  const files = new Map([
    ["/src/App.jsx", `import '@/styles/globals.css'; export default function App() {}`],
    ["/styles/globals.css", `body { background: white; }`],
  ]);

  const result = createImportMap(files);
  expect(result.styles).toContain("body { background: white; }");
});

test("createPreviewHTML generates valid HTML", () => {
  const importMap = JSON.stringify({
    imports: {
      "react": "https://esm.sh/react@19",
    },
  });
  const bundleCode = "const App = () => null; export default App;";

  const html = createPreviewHTML("/App.jsx", importMap, "", [], bundleCode);

  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain('<div id="root"></div>');
  expect(html).toContain('type="importmap"');
  expect(html).toContain(importMap);
  expect(html).toContain("loadApp()");
});

test("createPreviewHTML includes Tailwind CSS", () => {
  const html = createPreviewHTML("/App.jsx", "{}");
  expect(html).toContain("https://cdn.tailwindcss.com");
});

test("createPreviewHTML centers generated components in the viewport", () => {
  const html = createPreviewHTML("/App.jsx", "{}");
  // #root fills the viewport and uses flex to center small components both
  // horizontally and vertically (full-screen min-h-screen apps are unaffected).
  const rootCss = html.slice(html.indexOf("#root"), html.indexOf(".error-boundary"));
  expect(rootCss).toContain("width: 100vw;");
  expect(rootCss).toContain("height: 100vh;");
  expect(rootCss).toContain("display: flex;");
  expect(rootCss).toContain("align-items: center;");
  expect(rootCss).toContain("justify-content: center;");
});

test("createPreviewHTML opts into the app theme for the iframe document", () => {
  const light = createPreviewHTML("/App.jsx", "{}");
  expect(light).toContain("color-scheme: light");

  const dark = createPreviewHTML("/App.jsx", "{}", "", [], undefined, undefined, true, "dark");
  expect(dark).toContain("color-scheme: dark");
});

test("createPreviewHTML skips flex centering for full-screen components", () => {
  const html = createPreviewHTML("/App.jsx", "{}", "", [], undefined, undefined, false);
  const rootCss = html.slice(html.indexOf("#root"), html.indexOf(".error-boundary"));
  expect(rootCss).toContain("width: 100vw;");
  expect(rootCss).toContain("height: 100vh;");
  expect(rootCss).not.toContain("display: flex;");
});

test("isFullScreenComponent detects viewport-filling roots", () => {
  expect(isFullScreenComponent(`export default function App() {
    return <div className="min-h-screen bg-gray-50">hi</div>;
  }`)).toBe(true);
  expect(isFullScreenComponent(`export default function App() {
    return <main className="h-dvh flex items-center justify-center">hi</main>;
  }`)).toBe(true);
  expect(isFullScreenComponent(`export default function App() {
    return <div className="max-w-md mx-auto p-6">small card</div>;
  }`)).toBe(false);
  expect(isFullScreenComponent("")).toBe(false);
});

test("createPreviewHTML includes error boundary when bundleCode is provided", () => {
  const html = createPreviewHTML("/App.jsx", "{}", "", [], "export default function App() {}");
  expect(html).toContain("class ErrorBoundary");
  expect(html).toContain("componentDidCatch");
  expect(html).toContain("error-boundary");
});

test("createPreviewHTML does not include loadApp when no bundleCode", () => {
  const html = createPreviewHTML("/App.jsx", "{}");
  expect(html).not.toContain("loadApp()");
});

test("createPreviewHTML injects CSS styles into head", () => {
  const styles = `
    body { margin: 0; }
    .container { padding: 20px; }
  `;

  const html = createPreviewHTML("/App.jsx", "{}", styles);

  expect(html).toContain("<style>");
  expect(html).toContain("body { margin: 0; }");
  expect(html).toContain(".container { padding: 20px; }");
});

test("createPreviewHTML handles empty CSS gracefully", () => {
  const html = createPreviewHTML("/App.jsx", "{}", "");

  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain('<div id="root"></div>');
});

test("createPreviewHTML preserves existing styles with CSS injection", () => {
  const customStyles = "h1 { color: blue; }";
  const html = createPreviewHTML("/App.jsx", "{}", customStyles);

  expect(html).toContain("https://cdn.tailwindcss.com");
  expect(html).toContain("h1 { color: blue; }");
  expect(html).toContain("body {");
  expect(html).toContain(".error-boundary {");
});

test("createPreviewHTML displays syntax errors", () => {
  const errors = [
    { path: "/Component.jsx", error: "Unexpected token" },
    { path: "/Another.jsx", error: "Missing semicolon" }
  ];

  const html = createPreviewHTML("/App.jsx", "{}", "", errors);

  expect(html).toContain("Syntax Errors (2)");
  expect(html).toContain("/Component.jsx");
  expect(html).toContain("Unexpected token");
  expect(html).toContain("/Another.jsx");
  expect(html).toContain("Missing semicolon");
  expect(html).not.toContain("loadApp()");
});

test("createPreviewHTML escapes </script> in bundleCode", () => {
  const bundleCode = `const App = () => 'literal </script> here'; export default App;`;

  const html = createPreviewHTML("/App.jsx", "{}", "", [], bundleCode);

  // The bundle source embedded in the inline script must not contain the
  // raw "</script>" sequence, or the script tag would terminate early.
  expect(html).toContain("\\u003c/script");
  expect(html.split("</script>").length).toBeGreaterThanOrEqual(4);
});

test("createPreviewHTML renders a fallback panel for an empty bundle", () => {
  const html = createPreviewHTML("/App.jsx", "{}", "", []);

  expect(html).toContain("No renderable component");
  expect(html).not.toContain("loadApp()");
});

test("createPreviewHTML includes the parent error bridge", () => {
  const html = createPreviewHTML("/App.jsx", "{}", "", [], "export default function App() {}");

  expect(html).toContain("uigen:error");
  expect(html).toContain("parent.postMessage");
  expect(html).toContain("unhandledrejection");
  expect(html).toContain("componentStack");
});

test("createImportMap handles syntax errors gracefully", () => {
  vi.mocked(Babel.transform).mockImplementation((code, options) => {
    if (options.filename === "/BadComponent.jsx") {
      throw new Error("Unexpected token: Missing closing tag");
    }
    if (options.filename?.endsWith(".tsx") || options.filename?.endsWith(".ts")) {
      return { code: code.replace(/const/g, "var") };
    }
    return { code };
  });

  const files = new Map([
    ["/App.jsx", `export default function App() { return <div>Hello</div>; }`],
    ["/BadComponent.jsx", `
      export default function BadComponent() {
        return <div>Missing closing tag
      }
    `],
  ]);

  const result = createImportMap(files);

  // Good file should produce a bundle
  expect(result.bundleCode).toBeDefined();
  expect(result.bundleCode).toContain("App.jsx");
  // Bad file should not be in bundle
  expect(result.bundleCode).not.toContain("BadComponent");

  // Should have error for BadComponent
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].path).toBe("/BadComponent.jsx");
  expect(result.errors[0].error).toBe("Unexpected token: Missing closing tag");

  vi.mocked(Babel.transform).mockReset();
});

test("createBundleFromFiles produces valid bundle", () => {
  const files = new Map([
    ["/App.jsx", `
      import React from 'react';
      import Button from './Button';

      export default function App() {
        return <div><Button /></div>;
      }
    `],
    ["/Button.jsx", `
      export default function Button() {
        return <button>Click me</button>;
      }
    `],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.code).toBeDefined();
  expect(result.code).toContain("/App.jsx");
  expect(result.code).toContain("/Button.jsx");
  // Should have the App component
  expect(result.code).toContain("AppComponent");
  expect(result.code).toContain("export default");
});

test("createBundleFromFiles deduplicates CDN imports across files", () => {
  const files = new Map([
    ["/App.jsx", `
      import React from 'react';
      import { useState } from 'react';

      import Card from './Card';

      export default function App() {
        const [count, setCount] = useState(0);
        return <div><Card /></div>;
      }
    `],
    ["/Card.jsx", `
      import React from 'react';

      export default function Card() {
        return <div className="card">Card</div>;
      }
    `],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);

  const bundle = result.code;

  // React default + useState from both files should be merged into one import
  // (File A: import React + { useState }, File B: import React)
  // → import React, { useState } from 'react'
  expect(bundle).toContain("import React, { useState } from 'react'");
  expect(bundle).not.toContain("import React from 'react';\nimport React");

  // Should have exactly one jsx-runtime import (deduplicated)
  const jsxRuntimeMatches = bundle.match(/import\s+\{[^}]*jsx[^}]*\}\s+from\s+['"]react\/jsx-runtime['"]/g);
  expect(jsxRuntimeMatches).toHaveLength(1);

  expect(bundle).toContain("/App.jsx");
  expect(bundle).toContain("/Card.jsx");

  // CDN imports should appear before any file block
  const firstFileBlockIndex = bundle.indexOf("// ---");
  const cdnImportsBeforeFirstFile = bundle.slice(0, firstFileBlockIndex);
  expect(cdnImportsBeforeFirstFile).toContain("import React, { useState } from 'react'");
  expect(cdnImportsBeforeFirstFile).toContain("react/jsx-runtime");

  // Local imports (./Card) should be stripped
  expect(bundle).not.toMatch(/import\s+.*['"]\.\/Card['"]/);
});

test("createBundleFromFiles merges different imports from same package", () => {
  const files = new Map([
    ["/App.jsx", `
      import React from 'react';
      export default function App() {
        return <div>App</div>;
      }
    `],
    ["/utils.jsx", `
      import { useState } from 'react';
      export function useCustom() {
        return useState(0);
      }
    `],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);

  const bundle = result.code;

  // Both imports from 'react' should be merged into a single import statement
  // import React from 'react' + import { useState } from 'react'
  // → import React, { useState } from 'react'
  expect(bundle).toContain("import React, { useState } from 'react'");

  // Should NOT have separate import statements for the same package
  expect(bundle.match(/import\s+[^;]+from\s+['"]react['"]/g)).toHaveLength(1);

  // Should still have the jsx-runtime import
  expect(bundle).toContain("react/jsx-runtime");
});

test("createBundleFromFiles merges conflicting imports from same package", () => {
  const files = new Map([
    ["/App.jsx", `
      import React from 'react';
      export default function App() {
        return <div>App</div>;
      }
    `],
    ["/Component.jsx", `
      import React, { useState, useCallback } from 'react';
      export default function Component() {
        const [val, setVal] = useState(0);
        const cb = useCallback(() => {}, []);
        return <div>{val}</div>;
      }
    `],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);

  const bundle = result.code;

  // Both files import React from 'react', with different named bindings.
  // Should merge into one import with all bindings.
  expect(bundle).toContain("import React, { useState, useCallback } from 'react'");

  // React should only be bound once from the 'react' package
  const reactFromReact = bundle.match(/import\s+[^;]*\bReact\b[^;]*from\s+['"]react['"]/g);
  expect(reactFromReact).toHaveLength(1);
});

// CSS Support Tests
test("transformJSX detects CSS imports", () => {
  const code = `
    import React from 'react';
    import './styles.css';
    import '@/styles/globals.css';
    import "../components/Button.css";

    export default function App() { return <div>App</div>; }
  `;
  const result = transformJSX(code, "App.jsx", new Set());

  expect(result.cssImports).toBeDefined();
  expect(result.cssImports).toContain("./styles.css");
  expect(result.cssImports).toContain("@/styles/globals.css");
  expect(result.cssImports).toContain("../components/Button.css");
});

test("transformJSX removes CSS imports from transformed code", () => {
  const code = `
    import React from 'react';
    import './styles.css';

    export default function App() { return <div>App</div>; }
  `;
  const result = transformJSX(code, "App.jsx", new Set());

  expect(result.code).not.toContain("import './styles.css'");
  expect(result.code).toContain("React");
});

test("transformJSX handles CSS imports with different quotes", () => {
  const code = `
    import './single.css';
    import "./double.css";
    import '@/styles/globals.css';
  `;
  const result = transformJSX(code, "App.jsx", new Set());

  expect(result.cssImports).toContain("./single.css");
  expect(result.cssImports).toContain("./double.css");
  expect(result.cssImports).toContain("@/styles/globals.css");
});

test("createImportMap handles missing CSS files gracefully", () => {
  const files = new Map([
    ["/App.jsx", `import './missing.css'; export default function App() {}`],
  ]);

  const result = createImportMap(files);

  expect(result.styles).toBeDefined();
  // Should just not include the missing CSS, no crash
  expect(result.errors).toHaveLength(0);
});

test("integration: full pipeline handles components with CSS imports", () => {
  const files = new Map([
    ["/App.jsx", `
      import React from 'react';
      import './App.css';
      import '@/styles/globals.css';

      export default function App() {
        return <div className="container">Hello</div>;
      }
    `],
    ["/App.css", `.container { max-width: 1200px; margin: 0 auto; }`],
    ["/styles/globals.css", `body { font-family: sans-serif; }`],
  ]);

  const result = createImportMap(files);

  // Bundle code should exist
  expect(result.bundleCode).toBeDefined();
  expect(result.bundleCode).toContain("App.jsx");

  // CSS should be collected
  expect(result.styles).toContain(".container { max-width: 1200px;");
  expect(result.styles).toContain("body { font-family: sans-serif;");

  // HTML should include CSS
  const html = createPreviewHTML("/App.jsx", result.importMap, result.styles, [], result.bundleCode);
  expect(html).toContain(".container { max-width: 1200px;");
});
