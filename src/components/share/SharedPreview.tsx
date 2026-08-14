"use client";

import { useEffect, useRef, useState } from "react";
import {
  createImportMap,
  createPreviewHTML,
  isFullScreenComponent,
} from "@/lib/transform/jsx-transformer";
import { Loader2 } from "lucide-react";

const POSSIBLE_ENTRIES = [
  "/App.jsx",
  "/App.tsx",
  "/index.jsx",
  "/index.tsx",
  "/src/App.jsx",
  "/src/App.tsx",
];

interface SharedPreviewProps {
  files: Record<string, string>;
  name: string;
}

export function SharedPreview({ files }: SharedPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const paths = Object.keys(files);

    if (paths.length === 0) {
      setError("This share is empty.");
      setLoading(false);
      return;
    }

    const fileMap = new Map(Object.entries(files));
    const entry =
      POSSIBLE_ENTRIES.find((path) => fileMap.has(path)) ??
      paths.find((path) => path.endsWith(".jsx") || path.endsWith(".tsx")) ??
      null;

    if (!entry) {
      setError("No React component found in this share.");
      setLoading(false);
      return;
    }

    try {
      const { importMap, styles, errors, bundleCode } = createImportMap(fileMap);
      const nonce = crypto.randomUUID();
      // Don't force-centering on full-screen components: it would shrink
      // their root so the background no longer spans the full width.
      const centerComponent = !isFullScreenComponent(fileMap.get(entry) ?? "");
      const previewHTML = createPreviewHTML(
        entry,
        importMap,
        styles,
        errors,
        bundleCode,
        nonce,
        centerComponent
      );

      if (iframeRef.current) {
        const iframe = iframeRef.current;
        iframe.setAttribute("sandbox", "allow-scripts");
        iframe.srcdoc = previewHTML;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unknown preview error"
      );
    } finally {
      setLoading(false);
    }
  }, [files]);

  return (
    <div className="h-full w-full bg-white border border-neutral-200/60 rounded-lg overflow-hidden relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
          <p className="text-sm text-neutral-500">{error}</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="w-full h-full border-0"
        title="Shared component"
      />
    </div>
  );
}
