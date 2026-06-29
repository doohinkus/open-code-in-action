import { test, expect, vi } from "vitest";
import {
  transformJSX,
  createBlobURL,
  createImportMap,
  createPreviewHTML,
  createBundleFromFiles,
} from "../jsx-transformer";
import * as Babel from "@babel/standalone";

vi.mock("@babel/standalone", () => ({
  transform: vi.fn((code, options) => {
    if (options.filename?.endsWith(".tsx") || options.filename?.endsWith(".ts")) {
      return { code: code.replace(/const/g, "var") };
    }
    return { code };
  }),
}));

global.URL.createObjectURL = vi.fn((blob) => {
  return `blob:mock-url-${Math.random()}`;
});

test("transformJSX transforms TypeScript files with correct presets", () => {
  const code = `const Component = () => <div>Hello</div>;`;
  const result = transformJSX(code, "test.tsx", new Set());

  expect(result.error).toBeUndefined();
  expect(result.code).toBe("var Component = () => <div>Hello</div>;");
  expect(result.missingImports).toBeDefined();
});

test("transformJSX handles JavaScript files without TypeScript preset", () => {
  const code = `const Component = () => <div>Hello</div>;`;
  const result = transformJSX(code, "test.jsx", new Set());

  expect(result.error).toBeUndefined();
  expect(result.code).toBe(code);
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
