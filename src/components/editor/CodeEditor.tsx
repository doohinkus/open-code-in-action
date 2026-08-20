"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { Code2 } from "lucide-react";
import { EDITOR_CHANGE_DEBOUNCE_MS } from "@/lib/constants";

export function CodeEditor() {
  const { selectedFile, getFileContent, updateFile } = useFileSystem();
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<any>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [selectedFile]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!selectedFile || value === undefined) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      updateFile(selectedFile, value);
    }, EDITOR_CHANGE_DEBOUNCE_MS);
  }, [selectedFile, updateFile]);

  const getLanguageFromPath = (path: string): string => {
    const extension = path.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "js":
      case "jsx":
        return "javascript";
      case "ts":
      case "tsx":
        return "typescript";
      case "json":
        return "json";
      case "css":
        return "css";
      case "html":
        return "html";
      case "md":
        return "markdown";
      default:
        return "plaintext";
    }
  };

  const monacoTheme =
    mounted && resolvedTheme === "dark" ? "vs-dark" : "light";

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Code2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Select a file to edit</p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Choose a file from the file tree
          </p>
        </div>
      </div>
    );
  }

  const content = getFileContent(selectedFile) || "";
  const language = getLanguageFromPath(selectedFile);

  return (
    <div className="flex flex-col h-full">
      <div className="h-9 flex items-center px-3 border-b border-border bg-muted/40 flex-shrink-0">
        <span className="text-xs font-mono text-muted-foreground truncate">
          {selectedFile}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          value={content}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          theme={monacoTheme}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly: false,
            automaticLayout: true,
            wordWrap: "on",
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  );
}
