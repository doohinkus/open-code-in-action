import { test, expect, describe } from "vitest";
import { buildStorybookProject } from "@/lib/export-storybook";

function sampleApp(): Map<string, string> {
  return new Map([
    [
      "/App.jsx",
      [
        "import React from 'react';",
        "import Counter from '@/components/Counter';",
        "export default function App() {",
        "  return <Counter />;",
        "}",
      ].join("\n"),
    ],
    [
      "/components/Counter.jsx",
      [
        "import { useState } from 'react';",
        "export default function Counter() {",
        "  const [n, setN] = useState(0);",
        "  return <button type=\"button\">{n}</button>;",
        "}",
      ].join("\n"),
    ],
    ["/lib/format.js", "export const fmt = (n) => n.toFixed(2);\n"],
  ]);
}

describe("buildStorybookProject", () => {
  test("includes the full runnable scaffold", () => {
    const out = buildStorybookProject(sampleApp());
    for (const path of [
      "package.json",
      "vite.config.js",
      ".storybook/main.js",
      ".storybook/preview.js",
      "src/index.css",
      "src/App.jsx",
      "src/components/Counter.jsx",
      "src/stories/App.stories.jsx",
      "src/stories/Counter.stories.jsx",
    ]) {
      expect(out.has(path), path).toBe(true);
    }
  });

  test("copies unmatched support files verbatim under src/", () => {
    const out = buildStorybookProject(sampleApp());
    expect(out.get("src/lib/format.js")).toBe("export const fmt = (n) => n.toFixed(2);\n");
  });

  test("rewrites @/ imports to relative paths", () => {
    const out = buildStorybookProject(sampleApp());
    const app = out.get("src/App.jsx")!;
    expect(app).not.toContain("@/");
    expect(app).toContain("from './components/Counter'");
    const story = out.get("src/stories/App.stories.jsx")!;
    expect(story).toContain("import App from '../App'");
  });

  test("package.json is valid JSON with storybook scripts and deps", () => {
    const out = buildStorybookProject(sampleApp());
    const pkg = JSON.parse(out.get("package.json")!);
    expect(pkg.scripts.storybook).toBeTruthy();
    expect(pkg.scripts["build-storybook"]).toBeTruthy();
    expect(pkg.devDependencies.storybook).toMatch(/^\^9\./);
    expect(pkg.devDependencies["@storybook/react-vite"]).toMatch(/^\^9\./);
  });

  test("stories reference their component and declare a Default story", () => {
    const out = buildStorybookProject(sampleApp());
    const counter = out.get("src/stories/Counter.stories.jsx")!;
    expect(counter).toContain("import Counter from '../components/Counter'");
    expect(counter).toContain("component: Counter");
    expect(counter).toContain("export const Default = {};");
  });

  test("falls back to file-derived component name when default export is anonymous", () => {
    const files = new Map([
      ["/App.jsx", "export default () => <div />;\n"],
      ["/components/Toast.jsx", "export default function () { return null; }\n"],
    ]);
    const out = buildStorybookProject(files);
    expect(out.get("src/stories/Toast.stories.jsx")).toContain("import Toast from '../components/Toast'");
  });

  test("handles a project with no components directory", () => {
    const out = buildStorybookProject(new Map([["/App.jsx", "export default App;\n"]]));
    expect([...out.keys()].filter((k) => k.endsWith(".stories.jsx"))).toEqual([
      "src/stories/App.stories.jsx",
    ]);
  });

  test("scaffold is identical across projects (stable package versions)", () => {
    const out = buildStorybookProject(sampleApp());
    const files = new Map([
      ["/App.jsx", "export default A;\n"],
      ["/components/A.jsx", "export default A;\n"],
      ["/components/B.jsx", "export default B;\n"],
    ]);
    const out2 = buildStorybookProject(files);
    expect(out.get("package.json")).toBe(out2.get("package.json"));
    expect(out.get(".storybook/main.js")).toBe(out2.get(".storybook/main.js"));
  });
});
