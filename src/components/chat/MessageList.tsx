"use client";

import React from "react";
import { Message } from "ai";
import { cn } from "@/lib/utils";
import { User, Bot, Loader2, Sparkles } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  onStarterPrompt?: (prompt: string) => void;
}

interface MessageItemProps {
  message: Message;
  isLoading: boolean;
  isLast: boolean;
}

const STARTER_PROMPTS = [
  "Create a counter with increment, decrement, and reset",
  "Build a contact form with name, email, and message",
  "Design a pricing card with three tiers",
  "Make a simple dashboard widget with stats",
];

const MessageItem = React.memo(function MessageItem({ message, isLoading, isLast }: MessageItemProps) {
  const parts = message.parts;
  return (
    <div
      key={message.id || message.content}
      data-role={message.role}
      className={cn(
        "flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.role === "assistant" && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
        </div>
      )}

      <div className={cn(
        "flex flex-col gap-2 max-w-[85%]",
        message.role === "user" ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "rounded-2xl px-4 py-3 shadow-sm",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-card text-foreground border border-border"
        )}>
          <div className="text-sm">
            {parts ? (
              <>
                {parts.map((part, partIndex) => {
                  switch (part.type) {
                    case "text": {
                      const prevPart = parts[partIndex - 1];
                      const consumed = prevPart?.type === "reasoning" && !prevPart.reasoning?.trim();
                      if (consumed) return null;
                      return message.role === "user" ? (
                        <span key={partIndex} className="whitespace-pre-wrap">{part.text}</span>
                      ) : (
                        <MarkdownRenderer
                          key={partIndex}
                          content={part.text}
                          className="prose-sm"
                        />
                      );
                    }
                    case "reasoning": {
                      const hasReasoning = !!part.reasoning?.trim();
                      const nextPart = parts[partIndex + 1];
                      const consumedText = !hasReasoning && nextPart?.type === "text" ? nextPart.text : "";
                      if (!hasReasoning && !consumedText) return null;
                      return (
                        <div key={partIndex} className="mt-3 p-3 bg-muted/60 rounded-lg border border-border">
                          <span className="text-xs font-medium text-muted-foreground block mb-1">Reasoning</span>
                          {hasReasoning ? (
                            <span className="text-sm text-foreground/90">{part.reasoning}</span>
                          ) : (
                            <MarkdownRenderer content={consumedText} className="prose-sm" />
                          )}
                        </div>
                      );
                    }
                    case "tool-invocation":
                      const tool = part.toolInvocation;
                      const getLabel = (toolName: string, args: any): string => {
                        if (!args) return toolName;
                        const { command, path, new_path } = args as {
                          command?: string;
                          path?: string;
                          new_path?: string;
                        };
                        if (toolName === "str_replace_editor") {
                          switch (command) {
                            case "create": return `Creating ${path}`;
                            case "str_replace": return `Editing ${path}`;
                            case "insert": return `Editing ${path}`;
                            case "view": return `Viewing ${path}`;
                            default: return `Editing ${path}`;
                          }
                        }
                        if (toolName === "file_manager") {
                          if (command === "rename") return `Renaming ${path} → ${new_path}`;
                          if (command === "delete") return `Deleting ${path}`;
                        }
                        return `${toolName} ${path || ""}`;
                      };
                      const label = getLabel(tool.toolName, tool.args);
                      const toolResult = tool.state === "result" ? tool.result : null;
                      const toolFailed =
                        toolResult !== null &&
                        ((typeof toolResult === "string" &&
                          toolResult.startsWith("Error")) ||
                          (typeof toolResult === "object" &&
                            toolResult !== null &&
                            (toolResult as any).error != null));
                      return (
                        <div key={partIndex} className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-muted rounded-lg text-xs font-mono border border-border">
                          {tool.state === "result" ? (
                            toolFailed ? (
                              <>
                                <div className="w-2 h-2 rounded-full bg-destructive"></div>
                                <span className="text-foreground/80">{label}</span>
                                <span className="text-destructive">
                                  {typeof toolResult === "string"
                                    ? toolResult
                                    : (toolResult as any)?.error}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 rounded-full bg-success"></div>
                                <span className="text-foreground/80">{label}</span>
                              </>
                            )
                          ) : (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-primary" />
                              <span className="text-foreground/80">{label}</span>
                            </>
                          )}
                        </div>
                      );
                    case "source":
                      return (
                        <div key={partIndex} className="mt-2 text-xs text-muted-foreground">
                          Source: {JSON.stringify(part.source)}
                        </div>
                      );
                    case "step-start":
                      return partIndex > 0 ? <hr key={partIndex} className="my-3 border-border" /> : null;
                    default:
                      return null;
                  }
                })}
                {isLoading &&
                  message.role === "assistant" &&
                  isLast && (
                    <div className="flex items-center gap-2 mt-3 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-sm">Generating...</span>
                    </div>
                  )}
              </>
            ) : message.content ? (
              message.role === "user" ? (
                <span className="whitespace-pre-wrap">{message.content}</span>
              ) : (
                <MarkdownRenderer content={message.content} className="prose-sm" />
              )
            ) : isLoading &&
              message.role === "assistant" &&
              isLast ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-sm">Generating...</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {message.role === "user" && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary shadow-sm flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
        </div>
      )}
    </div>
  );
});

export function MessageList({ messages, isLoading, onStarterPrompt }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 mb-4 shadow-sm">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <p className="text-foreground font-semibold text-lg mb-2 tracking-tight">
          Start building with AI
        </p>
        <p className="text-muted-foreground text-sm max-w-sm mb-6">
          Describe a component and watch it appear in the preview
        </p>
        {onStarterPrompt && (
          <div className="flex flex-wrap justify-center gap-2 max-w-md">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onStarterPrompt(prompt)}
                className="px-3 py-1.5 text-xs font-medium rounded-full border border-border bg-card text-foreground/80 hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-colors shadow-sm"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-6">
      <div className="space-y-5 max-w-4xl mx-auto w-full">
        {messages.map((message, index) => (
          <MessageItem
            key={message.id || message.content}
            message={message}
            isLoading={isLoading ?? false}
            isLast={index === messages.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
