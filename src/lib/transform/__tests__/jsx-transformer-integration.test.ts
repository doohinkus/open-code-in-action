import { test, expect } from "vitest";
import {
  createBundleFromFiles,
  createImportMap,
} from "../jsx-transformer";

// These tests exercise the real @babel/standalone pipeline (no mock) to cover
// the bundler's export-rewriting and CDN import handling end to end.

test("integration: React namespace usage without import gets a default react import", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `export default function Counter() {
  const [count, setCount] = React.useState(0);
  return <div>{count}</div>;
};`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("import React from 'react'");
  expect(result.code).not.toContain("React is not defined");
});

test("integration: anonymous arrow default export becomes a renderable entry", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `export default () => {
  return <div>Hello</div>;
};`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("const __uigenDefault = () =>");
  expect(result.code).toContain("const __AppComponent = __uigenDefault");
  expect(result.code).toContain("export { __AppComponent as App }");
});

test("integration: anonymous function default export becomes a renderable entry", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `export default function() {
  return <div>Hi</div>;
}`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("const __uigenDefault = function()");
  expect(result.code).toContain("const __AppComponent = __uigenDefault");
});

test("integration: async function default export is bound correctly", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `export default async function App() {
  return <div>Hi</div>;
}`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("async function App()");
  expect(result.code).toContain("const __AppComponent = __uigenDefault");
  expect(result.code).toContain("export { __AppComponent as App }");
});

test("integration: identifier reference default export is bound to __uigenDefault", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `function App() { return <div>Hi</div>; }
export default App;`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("const __uigenDefault = App;");
  expect(result.code).toContain("const __AppComponent = __uigenDefault");
});

test("integration: named function default export still resolves by name", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `export default function App() { return <div>Hi</div>; }`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("function App()");
  expect(result.code).toContain("const __AppComponent = App");
});

test("integration: side-effect CDN imports get an import-map entry", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `import 'confetti';
export default () => <div>Party</div>;`],
  ]);

  const result = createImportMap(files);
  const parsed = JSON.parse(result.importMap);

  expect(parsed.imports).toHaveProperty("confetti", "https://esm.sh/confetti");
});

test("integration: conflicting CDN named imports from the same package both bind", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `import { Button } from 'ui-lib';
export default () => <Button />;`],
    ["/extra.jsx", `import { Button as Btn } from 'ui-lib';
export const extra = () => <Btn />;`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("import { Button, Button as Btn } from 'ui-lib'");
  expect(result.code).toContain("_jsx(Button, {}");
  expect(result.code).toContain("_jsx(Btn, {}");
});

test("integration: CDN import is emitted once with all aliases", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `import { Button } from 'ui-lib';
export default () => <Button />;`],
    ["/extra.jsx", `import { Card as CardView } from 'ui-lib';
export const extra = () => <CardView />;`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  const uiLibImports = result.code.match(/from\s+['"]ui-lib['"]/g) || [];
  expect(uiLibImports).toHaveLength(1);
  expect(result.code).toContain("import { Button, Card as CardView } from 'ui-lib'");
});
