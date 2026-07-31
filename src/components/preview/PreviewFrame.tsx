"use client";

import { useEffect, useRef, useState } from "react";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { useChat } from "@/lib/contexts/chat-context";
import {
  createImportMap,
  createPreviewHTML,
} from "@/lib/transform/jsx-transformer";
import { AlertCircle, Loader2, Wand2 } from "lucide-react";
import { GenerationActivityLog } from "./GenerationActivityLog";

const REBUILD_DEBOUNCE_MS = 350;

interface PreviewErrorInfo {
  message: string;
  stack?: string;
}

export function PreviewFrame() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { getAllFiles, refreshTrigger, isFixingErrors } = useFileSystem();
  const { status, requestFix } = useChat();
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<PreviewErrorInfo | null>(null);
  const [entryPoint, setEntryPoint] = useState<string>("/App.jsx");
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  const isGenerating = status === "streaming" || status === "submitted";

  // Surface runtime errors from inside the sandboxed iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (data && data.type === "uigen:error") {
        setPreviewError({ message: data.message, stack: data.stack });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (isGenerating || isFixingErrors) return;

    const timer = setTimeout(() => {
      const updatePreview = () => {
        try {
          const files = getAllFiles();

          // Clear error first when we have files
          if (files.size > 0 && error) {
            setError(null);
          }

          // Find the entry point - look for App.jsx, App.tsx, index.jsx, or index.tsx
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
              // Just use the first .jsx/.tsx file found
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

          // We have files, so it's no longer the first load
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

          // Guard against an empty bundle producing a blank iframe
          if (errors.length === 0 && !bundleCode) {
            setError(
              "No React component found. Create an App.jsx file that exports a default component to get started."
            );
            return;
          }

          const nonce = crypto.randomUUID();
          const previewHTML = createPreviewHTML(foundEntryPoint, importMap, styles, errors, bundleCode, nonce);

          if (iframeRef.current) {
            const iframe = iframeRef.current;

            // Sandbox: allow-scripts only — intentionally no allow-same-origin
            // to prevent AI-generated code from accessing the parent page's
            // sessionStorage, cookies, or DOM. User code runs in a null origin.
            iframe.setAttribute(
              "sandbox",
              "allow-scripts"
            );
            iframe.srcdoc = previewHTML;

            setError(null);
            setPreviewError(null);
          }
        } catch (err) {
          console.error("Preview error:", err);
          setError(err instanceof Error ? err.message : "Unknown preview error");
        }
      };

      updatePreview();
    }, REBUILD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [refreshTrigger, getAllFiles, entryPoint, error, isFirstLoad, isGenerating, isFixingErrors]);

  if (isGenerating) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-gray-50">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Generating Preview...
          </h2>
          <GenerationActivityLog />
        </div>
      </div>
    );
  }

  if (isFixingErrors) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-gray-50">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Fixing Syntax Errors...
          </h2>
          <GenerationActivityLog />
        </div>
      </div>
    );
  }

  if (error) {
    if (error === "firstLoad") {
      return (
        <div className="h-full flex items-center justify-center p-8 bg-gray-50">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <svg
                className="h-8 w-8 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Welcome to UI Generator
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              Start building React components with AI assistance
            </p>
            <p className="text-xs text-gray-500">
              Ask the AI to create your first component to see it live here
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex items-center justify-center p-8 bg-gray-50">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
            <AlertCircle className="h-8 w-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            No Preview Available
          </h2>
          <p className="text-sm text-gray-500">{error}</p>
          <p className="text-xs text-gray-400 mt-2">
            Start by creating a React component using the AI assistant
          </p>
        </div>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-gray-50">
        <div className="text-center max-w-md w-full">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Preview Error
          </h2>
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
            <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-all">
              {previewError.message}
            </p>
            {previewError.stack && (
              <p className="text-[10px] text-red-500 font-mono whitespace-pre-wrap mt-2 max-h-32 overflow-y-auto">
                {previewError.stack}
              </p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => requestFix(previewError.message)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Wand2 className="h-4 w-4" />
              Fix with AI
            </button>
            <button
              onClick={() => setPreviewError(null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full border-0 bg-white"
      title="Preview"
    />
  );
}
