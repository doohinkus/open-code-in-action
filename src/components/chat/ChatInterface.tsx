"use client";

import { useEffect, useRef } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { useToast } from "@/components/ui/toast";
import { RotateCcw } from "lucide-react";

export function ChatInterface() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { messages, input, handleInputChange, handleSubmit, status, error, reload } = useChat();
  const { toast } = useToast();
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (prevStatusRef.current !== "error" && status === "error" && error) {
      const message = error.message.includes("429")
        ? "Too many requests. Please wait a moment and try again."
        : error.message.includes("401")
          ? "Authentication required. Please sign in."
          : error.message.includes("403")
            ? "Request blocked. Please try again."
            : error.message.includes("Failed to fetch")
              ? "Network error. Check your connection and try again."
              : "Something went wrong. Please try again.";
      toast(message, "error");
    }
    prevStatusRef.current = status;
  }, [status, error, toast]);

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
        />
      </div>
    </div>
  );
}
