"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { useChat } from "@/lib/contexts/chat-context";
import { useInspection } from "@/lib/contexts/inspection-context";
import {
  createImportMap,
  createPreviewHTML,
  isFullScreenComponent,
} from "@/lib/transform/jsx-transformer";
import { AlertCircle, Loader2, Wand2, MousePointerClick, Sparkles } from "lucide-react";
import { GenerationActivityLog } from "./GenerationActivityLog";
import { InspectionOverlay } from "./InspectionOverlay";
import { logger } from "@/lib/observability/logger";
import { REBUILD_DEBOUNCE_MS } from "@/lib/constants";

interface PreviewErrorInfo {
  message: string;
  stack?: string;
}

function PreviewChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center p-8 bg-muted/40 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.52_0.12_175_/_0.08),transparent_65%)]"
      />
      <div className="relative text-center max-w-md w-full">{children}</div>
    </div>
  );
}

export function PreviewFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { getAllFiles, refreshTrigger, isFixingErrors } = useFileSystem();
  const { status, requestFix } = useChat();
  const {
    isInspectMode,
    setInspectMode,
    tagElement,
    setHoveredElement,
  } = useInspection();
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<PreviewErrorInfo | null>(null);
  const [entryPoint, setEntryPoint] = useState<string>("/App.jsx");
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [iframeRect, setIframeRect] = useState<DOMRect | null>(null);

  const isGenerating = status === "streaming" || status === "submitted";

  const updateIframeRect = useCallback(() => {
    if (iframeRef.current) {
      setIframeRect(iframeRef.current.getBoundingClientRect());
    }
  }, []);

  useEffect(() => {
    if (!isInspectMode) return;
    updateIframeRect();
    window.addEventListener("resize", updateIframeRect);
    window.addEventListener("scroll", updateIframeRect);
    return () => {
      window.removeEventListener("resize", updateIframeRect);
      window.removeEventListener("scroll", updateIframeRect);
    };
  }, [isInspectMode, updateIframeRect]);

  useEffect(() => {
    if (isGenerating) {
      setInspectMode(false);
    }
  }, [isGenerating, setInspectMode]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "uigen:error") {
        setPreviewError({ message: data.message, stack: data.stack });
        const error = new Error(data.message);
        error.stack = data.stack;
        Sentry.captureException(error, {
          tags: { source: "preview-sandbox" },
        });
      } else if (data.type === "uigen:element-hover") {
        setHoveredElement({
          id: data.id,
          label: data.label,
          rect: data.rect,
        });
      } else if (data.type === "uigen:element-select") {
        tagElement({
          id: data.id,
          label: data.label,
          tagName: data.tagName,
          classes: data.classes,
          textContent: data.textContent,
        });
        setInspectMode(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [tagElement, setInspectMode, setHoveredElement]);

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        { type: "uigen:set-inspection-mode", enabled: isInspectMode },
        "*"
      );
    }
  }, [isInspectMode, refreshTrigger]);

  useEffect(() => {
    if (isGenerating || isFixingErrors) return;

    const timer = setTimeout(() => {
      const updatePreview = () => {
        try {
          const files = getAllFiles();

          if (files.size > 0 && error) {
            setError(null);
          }

          let foundEntryPoint = entryPoint;
          const possibleEntries = [
            "/App.jsx",
            "/App.tsx",
            "/index.jsx",
            "/index.tsx",
            "/src/App.jsx",
            "/src/App.tsx",
          ];

          if (!files.has(entryPoint)) {
            const found = possibleEntries.find((path) => files.has(path));
            if (found) {
              foundEntryPoint = found;
              setEntryPoint(found);
            } else if (files.size > 0) {
              const firstJSX = Array.from(files.keys()).find(
                (path) => path.endsWith(".jsx") || path.endsWith(".tsx")
              );
              if (firstJSX) {
                foundEntryPoint = firstJSX;
                setEntryPoint(firstJSX);
              }
            }
          }

          if (files.size === 0) {
            if (isFirstLoad) {
              setError("firstLoad");
            } else {
              setError("No files to preview");
            }
            return;
          }

          if (isFirstLoad) {
            setIsFirstLoad(false);
          }

          if (!foundEntryPoint || !files.has(foundEntryPoint)) {
            setError(
              "No React component found. Create an App.jsx or index.jsx file to get started."
            );
            return;
          }

          const { importMap, styles, errors, bundleCode } = createImportMap(files);

          if (errors.length === 0 && !bundleCode) {
            setError(
              "No React component found. Create an App.jsx file that exports a default component to get started."
            );
            return;
          }

          const nonce = crypto.randomUUID();
          const centerComponent = !isFullScreenComponent(
            files.get(foundEntryPoint) ?? ""
          );
          const previewHTML = createPreviewHTML(
            foundEntryPoint,
            importMap,
            styles,
            errors,
            bundleCode,
            nonce,
            centerComponent
          );

          if (iframeRef.current) {
            const iframe = iframeRef.current;

            iframe.setAttribute(
              "sandbox",
              "allow-scripts"
            );
            iframe.srcdoc = previewHTML;

            setError(null);
            setPreviewError(null);
          }
        } catch (err) {
          logger.error("preview.build_failed", {
            error: err instanceof Error ? err.message : String(err),
          });
          Sentry.captureException(err, {
            tags: { source: "preview-build" },
          });
          setError(err instanceof Error ? err.message : "Unknown preview error");
        }
      };

      updatePreview();
    }, REBUILD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, getAllFiles, entryPoint, isFirstLoad, isGenerating, isFixingErrors]);

  const toggleInspectMode = () => {
    setInspectMode(!isInspectMode);
  };

  if (isGenerating) {
    return (
      <PreviewChrome>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/15 mb-4 shadow-sm">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
          Generating preview…
        </h2>
        <div className="mt-4 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 text-left shadow-sm">
          <GenerationActivityLog />
        </div>
      </PreviewChrome>
    );
  }

  if (isFixingErrors) {
    return (
      <PreviewChrome>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/15 border border-warning/25 mb-4 shadow-sm">
          <Loader2 className="h-8 w-8 text-warning animate-spin" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
          Fixing syntax errors…
        </h2>
        <div className="mt-4 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-4 text-left shadow-sm">
          <GenerationActivityLog />
        </div>
      </PreviewChrome>
    );
  }

  if (error) {
    if (error === "firstLoad") {
      return (
        <PreviewChrome>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/15 mb-4 shadow-sm">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
            Welcome to UI Generator
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Start building React components with AI assistance
          </p>
          <p className="text-xs text-muted-foreground/80">
            Ask the AI to create your first component to see it live here
          </p>
        </PreviewChrome>
      );
    }

    return (
      <PreviewChrome>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted border border-border mb-4">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
          No preview available
        </h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground/80 mt-2">
          Start by creating a React component using the AI assistant
        </p>
      </PreviewChrome>
    );
  }

  if (previewError) {
    return (
      <PreviewChrome>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
          Preview error
        </h2>
        <div className="mb-4 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-left">
          <p className="text-xs text-destructive font-mono whitespace-pre-wrap break-all">
            {previewError.message}
          </p>
          {previewError.stack && (
            <p className="text-[10px] text-destructive/70 font-mono whitespace-pre-wrap mt-2 max-h-32 overflow-y-auto">
              {previewError.stack}
            </p>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => requestFix(previewError.message)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm"
          >
            <Wand2 className="h-4 w-4" />
            Fix with AI
          </button>
          <button
            onClick={() => setPreviewError(null)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground bg-muted hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors border border-border"
          >
            Dismiss
          </button>
        </div>
      </PreviewChrome>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-background">
      <button
        onClick={toggleInspectMode}
        title={isInspectMode ? "Exit inspection mode" : "Click elements to tag them in the prompt"}
        className={`absolute top-2 right-2 z-40 p-2 rounded-lg transition-all ${
          isInspectMode
            ? "bg-primary text-primary-foreground shadow-lg"
            : "bg-card/90 text-muted-foreground hover:bg-card hover:text-foreground shadow-sm border border-border backdrop-blur-sm"
        }`}
      >
        <MousePointerClick className="h-4 w-4" />
      </button>
      <iframe
        ref={iframeRef}
        className="w-full h-full border-0 bg-background"
        title="Preview"
      />
      <InspectionOverlay iframeRect={iframeRect} />
    </div>
  );
}
