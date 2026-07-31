"use client";

import { useEffect, useRef } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { useToast } from "@/components/ui/toast";
import { RotateCcw } from "lucide-react";

function mapErrorMessage(raw: string): string {
  let serverMessage: string | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === "string") {
      serverMessage = parsed.error;
    }
  } catch {
    // Not JSON — raw error message from the SDK/fetch layer.
  }

  const text = serverMessage || raw;
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
  return serverMessage || "Something went wrong. Please try again.";
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
  } = useChat();
  const { toast } = useToast();
  const prevStatusRef = useRef(status);

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
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={status === "submitted" || status === "streaming"}
          onStop={stop}
        />
      </div>
    </div>
  );
}
