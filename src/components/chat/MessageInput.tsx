"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { Send, Mic, MicOff, Square, X } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { useInspection } from "@/lib/contexts/inspection-context";

interface MessageInputProps {
  input: string;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  onStop?: () => void;
}

export function MessageInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  onStop,
}: MessageInputProps) {
  const {
    isListening,
    isSupported,
    hasPermission,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const { taggedElements, removeTag, clearTags } = useInspection();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevTagCountRef = useRef(0);

  useEffect(() => {
    if (!transcript) return;

    const syntheticEvent = {
      target: { value: transcript },
    } as ChangeEvent<HTMLTextAreaElement>;
    handleInputChange(syntheticEvent);
  }, [transcript, handleInputChange]);

  useEffect(() => {
    if (!isListening && transcript) {
      resetTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  useEffect(() => {
    if (taggedElements.length > prevTagCountRef.current) {
      const newest = taggedElements[taggedElements.length - 1];
      const mention = `@${newest.label} `;
      const syntheticEvent = {
        target: { value: (input || "") + mention },
      } as ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
    }
    prevTagCountRef.current = taggedElements.length;
  }, [taggedElements, input, handleInputChange]);

  useEffect(() => {
    if (taggedElements.length === 0) {
      prevTagCountRef.current = 0;
    }
  }, [taggedElements.length]);

  const handleRemoveTag = (id: string) => {
    const el = taggedElements.find((e) => e.id === id);
    if (el) {
      const mention = `@${el.label} `;
      const mentionAlt = `@${el.label}`;
      let newValue = input || "";
      if (newValue.includes(mention)) {
        newValue = newValue.replace(mention, "");
      } else if (newValue.includes(mentionAlt)) {
        newValue = newValue.replace(mentionAlt, "");
      }
      const syntheticEvent = {
        target: { value: newValue },
      } as ChangeEvent<HTMLTextAreaElement>;
      handleInputChange(syntheticEvent);
    }
    removeTag(id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isListening) {
        stopListening();
      }
      clearTags();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    clearTags();
    handleSubmit(e);
  };

  const canSend = !isLoading && !!input?.trim();

  return (
    <form onSubmit={onSubmit} className="relative p-4 bg-card/80 border-t border-border backdrop-blur-sm">
      <div className="relative max-w-4xl mx-auto">
        {taggedElements.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {taggedElements.map((el) => (
              <span
                key={el.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/15"
              >
                @{el.label}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(el.id)}
                  className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">
          <textarea
            ref={textareaRef}
            value={isListening ? input + (interimTranscript ? " " + interimTranscript : "") : input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe the React component you want to create..."
            disabled={isLoading}
            className={`w-full min-h-[80px] max-h-[200px] pl-4 pr-24 py-3.5 rounded-2xl border-0 bg-transparent text-foreground resize-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground text-[15px] font-normal ${
              isListening ? "caret-destructive" : ""
            }`}
            rows={3}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {isSupported && hasPermission !== "denied" && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={isLoading}
                title={isListening ? "Stop listening" : "Start voice input"}
                className={`p-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed group ${
                  isListening
                    ? "bg-destructive/10 hover:bg-destructive/15"
                    : "hover:bg-muted"
                }`}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4 text-destructive animate-pulse" />
                ) : (
                  <Mic className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                )}
              </button>
            )}
            {isLoading && onStop && (
              <button
                type="button"
                onClick={onStop}
                title="Stop generating"
                className="p-2.5 rounded-xl transition-all hover:bg-destructive/10 group"
              >
                <Square className="h-4 w-4 text-destructive fill-destructive group-hover:opacity-90" />
              </button>
            )}
            <button
              type="submit"
              disabled={!canSend}
              title="Send message"
              className={`p-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed group ${
                canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Send
                className={`h-4 w-4 transition-transform ${
                  canSend ? "group-hover:translate-x-0.5 group-hover:-translate-y-0.5" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
