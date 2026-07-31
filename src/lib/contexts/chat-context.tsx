"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { useChat as useAIChat } from "@ai-sdk/react";
import { Message } from "ai";
import { useFileSystem } from "./file-system-context";
import { setHasAnonWork } from "@/lib/anon-work-tracker";

interface ChatContextProps {
  projectId?: string;
  initialMessages?: Message[];
}

interface ChatContextType {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  status: string;
  error: Error | undefined;
  reload: (chatRequestOptions?: any) => Promise<string | null | undefined>;
  append: (message: Message | { role: "user"; content: string }) => Promise<string | null | undefined>;
  stop: () => void;
  requestFix: (errorText: string) => void;
  generationTimedOut: boolean;
}

const STALL_TIMEOUT_MS = 120_000;

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  projectId,
  initialMessages = [],
}: ChatContextProps & { children: ReactNode }) {
  const {
    fileSystem,
    handleToolCall,
    validateCurrentFiles,
    setIsFixingErrors,
  } = useFileSystem();

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    status,
    error,
    reload,
    append,
    stop,
  } = useAIChat({
    api: "/api/chat",
    initialMessages,
    body: {
      files: fileSystem.serialize(),
      projectId,
    },
    onToolCall: ({ toolCall }) => {
      handleToolCall(toolCall);
    },
  });

  const fixAttemptCount = useRef(0);
  const prevStatusRef = useRef(status);
  const [generationTimedOut, setGenerationTimedOut] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      fixAttemptCount.current = 0;
      setGenerationTimedOut(false);
      setIsFixingErrors(false);
      originalHandleSubmit(e);
    },
    [originalHandleSubmit, setIsFixingErrors]
  );

  // Watchdog: if no stream activity for STALL_TIMEOUT_MS while generating,
  // abort the request so the UI doesn't hang indefinitely.
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") return;

    const timer = setTimeout(() => {
      stop();
      setGenerationTimedOut(true);
    }, STALL_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [status, messages, stop]);

  const requestFix = useCallback(
    (errorText: string) => {
      setIsFixingErrors(true);
      append({
        role: "user",
        content: `The preview is showing this error:\n\n${errorText}\n\nPlease fix it using the str_replace_editor tool.`,
      });
    },
    [append, setIsFixingErrors]
  );

  useEffect(() => {
    const wasStreaming =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    const isNowReady = status === "ready";
    prevStatusRef.current = status;

    if (!wasStreaming || !isNowReady) return;
    if (generationTimedOut) {
      setIsFixingErrors(false);
      return;
    }

    const errors = validateCurrentFiles();
    if (errors.length > 0 && fixAttemptCount.current < 2) {
      fixAttemptCount.current++;
      setIsFixingErrors(true);
      const errorList = errors
        .map((e) => `- ${e.path}: ${e.error}`)
        .join("\n");
      append({
        role: "user",
        content: `The generated code has syntax errors that need to be fixed:\n\n${errorList}\n\nPlease fix all syntax errors using the str_replace_editor tool.`,
      });
    } else {
      setIsFixingErrors(false);
    }
  }, [status, validateCurrentFiles, setIsFixingErrors, append, generationTimedOut]);

  // Track anonymous work
  useEffect(() => {
    if (!projectId && messages.length > 0) {
      setHasAnonWork(messages, fileSystem.serialize());
    }
  }, [messages, fileSystem, projectId]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        input,
        handleInputChange,
        handleSubmit,
        status,
        error,
        reload,
        append,
        stop,
        requestFix,
        generationTimedOut,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}