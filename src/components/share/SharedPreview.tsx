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

    // The overlay is hidden only once the iframe reports it has actually
    // rendered (or errored) — srcdoc assignment alone would dismiss it too
    // early and reveal a blank frame while the CDN modules are still loading.
    let done = false;
    const finishLoading = () => {
      if (done) return;
      done = true;
      setLoading(false);
      window.removeEventListener("message", onMessage);
      clearTimeout(safetyTimeout);
    };

    const onMessage = (event: MessageEvent) => {
      // Only accept messages from this component's own iframe.
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === "uigen:ready" || data?.type === "uigen:error") {
        if (data?.type === "uigen:error") {
          const detail =
            typeof data.message === "string" && data.message
              ? data.message
              : "";
          setError(detail || "Preview error");
        }
        finishLoading();
      }
    };
    window.addEventListener("message", onMessage);

    // Safety net: CDN hiccups or a syntax-error panel (which never posts
    // "uigen:ready") must not leave the overlay up forever.
    const safetyTimeout = setTimeout(() => {
      finishLoading();
    }, 10_000);

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
      finishLoading();
    }

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(safetyTimeout);
    };
  }, [files]);

  return (
    <div className="h-full w-full bg-card border border-border rounded-lg overflow-hidden relative shadow-sm">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="w-full h-full border-0 bg-background"
        title="Shared component"
      />
    </div>
  );
}
