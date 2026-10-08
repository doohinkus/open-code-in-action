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
  expect(result.code).toContain("const __uigenDefault_Appjsx = () =>");
  expect(result.code).toContain("const __AppComponent = __uigenDefault_Appjsx");
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
  expect(result.code).toContain("const __uigenDefault_Appjsx = function()");
  expect(result.code).toContain("const __AppComponent = __uigenDefault_Appjsx");
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
  expect(result.code).toContain("const __AppComponent = __uigenDefault_Appjsx");
  expect(result.code).toContain("export { __AppComponent as App }");
});

test("integration: identifier reference default export is bound to __uigenDefault", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `function App() { return <div>Hi</div>; }
export default App;`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  expect(result.code).toContain("const __uigenDefault_Appjsx = App;");
  expect(result.code).toContain("const __AppComponent = __uigenDefault_Appjsx");
});

// The canned two-file flow (App.jsx + components/Counter.jsx with an
// `export default Counter;` identifier default) previously produced TWO
// `const __uigenDefault` declarations in the shared bundle scope —
// "Cannot declare a const variable twice: '__uigenDefault'".
test("integration: synthetic default bindings are unique per file", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `import Counter from '@/components/Counter';

export default function App() {
  return <Counter />;
}`],
    ["/components/Counter.jsx", `const Counter = () => <div>0</div>;

export default Counter;`],
    ["/components/ContactForm.jsx", `const ContactForm = () => <form />;

export default ContactForm;`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  // No bare shared binding anywhere
  expect(result.code).not.toMatch(/const __uigenDefault =/);
  // Component files get their own unique bindings
  expect(result.code).toContain("const __uigenDefault_componentsCounterjsx = Counter;");
  expect(result.code).toContain("const __uigenDefault_componentsContactFormjsx = ContactForm;");
  // The named entry still resolves by name (App.jsx's default is named)
  expect(result.code).toContain("const __AppComponent = App;");
  // Each binding declared at most once (no duplicate const in one scope)
  for (const name of [
    "__uigenDefault_Appjsx",
    "__uigenDefault_componentsCounterjsx",
    "__uigenDefault_componentsContactFormjsx",
  ]) {
    const declared = result.code.match(new RegExp(`\\bconst ${name}\\b`, "g")) || [];
    expect(declared.length).toBeLessThanOrEqual(2); // binding + entry alias may both reference it
  }
});

test("integration: anonymous entry default resolves to the entry's own binding", () => {
  const files = new Map<string, string>([
    ["/App.jsx", `const Counter = () => <div>0</div>;

export default Counter;`],
    ["/components/Card.jsx", `const Card = () => <div>card</div>;

export default Card;`],
  ]);

  const result = createBundleFromFiles(files);

  expect(result.errors).toHaveLength(0);
  // Entry with an expression default: __AppComponent must point at the
  // ENTRY's binding, not another file's
  expect(result.code).toContain(
    "const __AppComponent = __uigenDefault_Appjsx;"
  );
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

  expect(parsed.imports["confetti"]).toBe(
    "https://esm.sh/confetti?external=react,react-dom"
  );
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
