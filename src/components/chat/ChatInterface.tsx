"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ModelSelector } from "./ModelSelector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { useToast } from "@/components/ui/toast";
import { RotateCcw, FlaskConical, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { getStoredModel } from "@/lib/model-selector";

export function mapErrorMessage(raw: string): string {
  let serverMessage: string | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === "string") {
      serverMessage = parsed.error;
    } else if (parsed?.error?.message) {
      serverMessage = parsed.error.message;
    }
  } catch {
    // Not JSON — raw error message from the SDK/fetch layer.
  }

  const text = serverMessage || raw;
  if (/FreeUsageLimit|free usage|free tier/i.test(text)) {
    return "This model hit its free-tier limit. Try switching to another free model above, or try again later.";
  }
  if (/too many|rate limit/i.test(text)) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (/authenticat/i.test(text)) {
    return "Authentication required. Please sign in.";
  }
  if (/origin|blocked|forbidden/i.test(text)) {
    return "Request blocked. Please try again.";
  }
  if (/abort|timed out|timeout/i.test(text)) {
    return "Generation timed out. Please try again.";
  }
  if (/failed to fetch|network/i.test(text)) {
    return "Network error. Check your connection and try again.";
  }
  if (/internal server error/i.test(text)) {
    return "AI provider returned an internal server error. The model may be temporarily unavailable. Please try again or switch models.";
  }
  if (/CreditsError|no payment|billing|FreeUsageLimit|quota|insufficient credits/i.test(text)) {
    return "AI provider account has no credits or has hit its usage limit. Please add a payment method or try again later.";
  }
  if (text === "An error occurred.") {
    return "Something went wrong. Please try again.";
  }
  return text || "Something went wrong. Please try again.";
}

export function ChatInterface() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    error,
    reload,
    stop,
    generationTimedOut,
    generationInterrupted,
    append,
  } = useChat();
  const { toast } = useToast();
  const prevStatusRef = useRef(status);
  const [testStatus, setTestStatus] = useState<"idle" | "running" | "pass" | "fail">("idle");

  const handleTestConnection = useCallback(async () => {
    setTestStatus("running");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Reply with only the word OK" }],
          files: {},
          test: true,
          model: getStoredModel(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error || `HTTP ${res.status}`;
        toast(`Connection failed: ${msg}`, "error");
        setTestStatus("fail");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        toast("Connection failed: no response body", "error");
        setTestStatus("fail");
        return;
      }
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      const match = text.match(/(?:^|\n)3:"([^"]*)"/);
      if (match) {
        toast(
          `Provider error: ${match[1] || "the AI provider returned an error while streaming"}`,
          "error"
        );
        setTestStatus("fail");
      } else {
        toast("Provider is healthy", "success");
        setTestStatus("pass");
      }
    } catch (e: any) {
      toast(`Connection failed: ${e.message}`, "error");
      setTestStatus("fail");
    }
  }, [toast]);

  useEffect(() => {
    if (prevStatusRef.current !== "error" && status === "error" && error) {
      toast(mapErrorMessage(error.message), "error");
    }
    prevStatusRef.current = status;
  }, [status, error, toast]);

  useEffect(() => {
    if (generationTimedOut) {
      toast("Generation timed out. Please try again.", "error");
    }
  }, [generationTimedOut, toast]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      <ScrollArea ref={scrollAreaRef} className="flex-1 overflow-hidden">
        <div className="pr-4">
          <MessageList messages={messages} isLoading={status === "streaming"} />
        </div>
      </ScrollArea>
      <div className="mt-4 flex-shrink-0">
        {status === "error" && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={() => reload()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}
        {generationInterrupted && (
          <div className="mb-3 px-3 py-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
            Generation was interrupted and may be incomplete. Say
            &ldquo;continue&rdquo; to keep going, or try again.
          </div>
        )}
        <div className="mb-2">
          <ModelSelector />
        </div>
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={status === "submitted" || status === "streaming"}
          onStop={stop}
        />
        {messages.length === 0 && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === "running"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {testStatus === "running" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : testStatus === "pass" ? (
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              ) : testStatus === "fail" ? (
                <XCircle className="h-3 w-3 text-red-500" />
              ) : (
                <FlaskConical className="h-3 w-3" />
              )}
              {testStatus === "running"
                ? "Testing..."
                : testStatus === "pass"
                  ? "Provider healthy"
                  : testStatus === "fail"
                    ? "Provider error"
                    : "Test connection"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
