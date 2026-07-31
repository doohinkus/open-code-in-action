"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { Send, Mic, MicOff, Square } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isListening) {
        stopListening();
      }
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

  return (
    <form onSubmit={handleSubmit} className="relative p-4 bg-white border-t border-neutral-200/60">
      <div className="relative max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={isListening ? input + (interimTranscript ? " " + interimTranscript : "") : input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe the React component you want to create..."
          disabled={isLoading}
          className={`w-full min-h-[80px] max-h-[200px] pl-4 pr-24 py-3.5 rounded-xl border bg-neutral-50/50 text-neutral-900 resize-none focus:outline-none focus:ring-2 focus:bg-white transition-all placeholder:text-neutral-400 text-[15px] font-normal shadow-sm ${
            isListening
              ? "border-red-300 focus:ring-red-500/10 focus:border-red-500/50"
              : "border-neutral-200 focus:ring-blue-500/10 focus:border-blue-500/50"
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
              className={`p-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed group ${
                isListening
                  ? "bg-red-50 hover:bg-red-100"
                  : "hover:bg-neutral-100"
              }`}
            >
              {isListening ? (
                <MicOff className="h-4 w-4 text-red-500 animate-pulse" />
              ) : (
                <Mic className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600" />
              )}
            </button>
          )}
          {isLoading && onStop && (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              className="p-2.5 rounded-lg transition-all hover:bg-red-50 group"
            >
              <Square className="h-4 w-4 text-red-500 fill-red-500 group-hover:text-red-600 group-hover:fill-red-600" />
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading || !input?.trim()}
            title="Send message"
            className="p-2.5 rounded-lg transition-all hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent group"
          >
            <Send className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${isLoading || !input?.trim() ? 'text-neutral-300' : 'text-blue-600'}`} />
          </button>
        </div>
      </div>
    </form>
  );
}
