"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ModelSelector } from "./ModelSelector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { RotateCcw, Eraser, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import {
  TOAST_DEFAULT_DURATION_MS,
} from "@/lib/constants";
import { mapErrorMessage } from "@/lib/chat-errors";

export { mapErrorMessage };

function truncateForThinkingLabel(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  const quoted = `"${collapsed.length > 60 ? `${collapsed.slice(0, 60)}…` : collapsed}"`;
  return quoted;
}

export function ChatInterface() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    input,
    handleInputChange,
    setInput,
    handleSubmit,
    status,
    reload,
    stop,
    generationInterrupted,
    append,
    clearContext: clearContextFromStore,
  } = useChat();
  const { toast } = useToast();

  const clearContext = useCallback(() => {
    setConfirmingClear(false);
    if (!clearContextFromStore()) return;
    toast("Cleared — fresh start ready.", "success");
  }, [clearContextFromStore, toast]);

  // Clearing removes the chat AND every generated file, which is not
  // recoverable — require a deliberate second click before anything is
  // destroyed. Escaping the confirm state (including after the auto-reset
  // below) returns to the dormant button.
  const [confirmingClear, setConfirmingClear] = useState(false);
  const { getAllFiles } = useFileSystem();
  const canClear =
    messages.length > 0 || getAllFiles().size > 0;
  const isBusy = status === "submitted" || status === "streaming";
  const showClear = canClear && !isBusy;

  useEffect(() => {
    if (!confirmingClear) return;
    const timer = setTimeout(() => setConfirmingClear(false), TOAST_DEFAULT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  const handleStarterPrompt = useCallback(
    (prompt: string) => {
      if (status === "streaming" || status === "submitted") return;
      if (append) {
        append({ role: "user", content: prompt });
        return;
      }
      setInput(prompt);
    },
    [append, setInput, status]
  );

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

  // While the request is in flight but the assistant hasn't produced any
  // reasoning, text, or tool content yet, show a generic "Thinking about
  // <the user's message>…" placeholder instead of dead air. Real thought
  // summaries (the Reasoning box) replace it as soon as they stream.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastMessage = messages[messages.length - 1];
  const assistantHasContent =
    lastMessage?.role === "assistant" &&
    !!lastMessage.parts?.some(
      (p) =>
        (p.type === "reasoning" && p.reasoning?.trim()) ||
        (p.type === "text" && p.text?.trim()) ||
        p.type === "tool-invocation"
    );
  const thinkingLabel =
    (status === "submitted" || status === "streaming") &&
    lastUserMessage &&
    !assistantHasContent
      ? `Thinking about ${truncateForThinkingLabel(lastUserMessage.content)}…`
      : undefined;

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      <ScrollArea ref={scrollAreaRef} className="flex-1 overflow-hidden">
        <div className="pr-4 h-full">
          <MessageList
            messages={messages}
            isLoading={status === "streaming"}
            onStarterPrompt={handleStarterPrompt}
            thinkingLabel={thinkingLabel}
          />
        </div>
      </ScrollArea>
      <div className="mt-4 flex-shrink-0">
        {status === "error" && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={() => reload()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground bg-muted hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors border border-border"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}
        {generationInterrupted && (
          <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 text-sm text-warning-foreground bg-warning/15 border border-warning/30 rounded-lg">
            <span>
              Generation was interrupted and may be incomplete. Say
              &ldquo;continue&rdquo; to keep going.
            </span>
            <button
              onClick={() => reload()}
              className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1 text-xs font-medium bg-card border border-border hover:bg-accent rounded-lg transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}
        <div className="mb-2 flex items-center justify-between gap-2">
          <ModelSelector />
          {showClear && (
            confirmingClear ? (
              <button
                onClick={clearContext}
                title="Click again to clear chat, files, and the preview"
                aria-label="Confirm clearing conversation, files, and preview"
                className="inline-flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Confirm clear?
              </button>
            ) : (
              <button
                onClick={() => setConfirmingClear(true)}
                title="Clear conversation context, files, and the preview"
                aria-label="Clear conversation context"
                className="inline-flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
              >
                <Eraser className="h-3 w-3" />
                Clear
              </button>
            )
          )}
        </div>
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          setInput={setInput}
          handleSubmit={handleSubmit}
          isLoading={status === "submitted" || status === "streaming"}
          onStop={stop}
        />
      </div>
    </div>
  );
}
