"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Copy, ExternalLink, Loader2, Check, RotateCcw } from "lucide-react";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { useChat } from "@/lib/contexts/chat-context";
import { useToast } from "@/components/ui/toast";

const ANON_TOKEN_KEY = "uigen_share_token";
const PROJECT_TOKEN_PREFIX = "uigen_share_token_";
const DEBOUNCE_MS = 600;

function tokenStorageKey(projectId?: string): string {
  return projectId ? `${PROJECT_TOKEN_PREFIX}${projectId}` : ANON_TOKEN_KEY;
}

function readStoredToken(projectId?: string): string | null {
  if (typeof window === "undefined") return null;
  const key = tokenStorageKey(projectId);
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function storeToken(projectId: string | undefined, token: string) {
  if (typeof window === "undefined") return;
  const key = tokenStorageKey(projectId);
  if (projectId) {
    localStorage.setItem(key, token);
  } else {
    sessionStorage.setItem(key, token);
  }
}

function filesHash(files: Map<string, string>): string {
  return JSON.stringify([...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function ShareBar() {
  const { getAllFiles, isFixingErrors } = useFileSystem();
  const { status, projectId } = useChat();
  const { toast } = useToast();

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const lastHashRef = useRef<string | null>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    tokenRef.current = readStoredToken(projectId);
  }, [projectId]);

  const publishShare = useCallback(
    async (projectId?: string) => {
      const files = getAllFiles();
      if (files.size === 0) return;

      const hash = filesHash(files);
      if (hash === lastHashRef.current) return;

      const data: Record<string, string> = {};
      files.forEach((content, path) => {
        data[path] = content;
      });

      setSharing(true);
      setFailed(false);
      try {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: data,
            projectId,
            previousToken: tokenRef.current ?? undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `HTTP ${res.status}`);
        }

        const json = await res.json();
        const url = json.url as string;
        const token = url.split("/").pop() ?? null;
        tokenRef.current = token;
        if (token) storeToken(projectId, token);
        lastHashRef.current = hash;
        setShareUrl(url);
      } catch (err) {
        setFailed(true);
      } finally {
        setSharing(false);
      }
    },
    [getAllFiles]
  );

  useEffect(() => {
    const wasGenerating = prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted";
    prevStatusRef.current = status;

    if (status !== "ready" || !wasGenerating) {
      return;
    }
    if (isFixingErrors) return;

    const files = getAllFiles();
    if (files.size === 0) {
      lastHashRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      publishShare(projectId);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isFixingErrors, getAllFiles, projectId, publishShare]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast("Link copied to clipboard", "success");
    } catch {
      toast("Failed to copy link", "error");
    }
  };

  if (!shareUrl && !sharing && !failed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-border bg-card flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        {sharing || !shareUrl ? (
          failed ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Share link failed
              <button
                onClick={() => publishShare(projectId)}
                className="inline-flex items-center gap-1 px-2 h-6 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title="Retry"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Creating share link...
            </span>
          )
        ) : (
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline truncate"
            title={shareUrl}
          >
            {shareUrl.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
      {shareUrl && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border"
            title="Copy link"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors border border-transparent hover:border-border"
            title="Open shared component"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </div>
      )}
    </div>
  );
}
