"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
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
  append: (message: Message | { role: "user"; content: string }) => Promise<string | null | undefined>;
}

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
    append,
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

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      fixAttemptCount.current = 0;
      setIsFixingErrors(false);
      originalHandleSubmit(e);
    },
    [originalHandleSubmit, setIsFixingErrors]
  );

  useEffect(() => {
    const wasStreaming =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    const isNowReady = status === "ready" || status === "error";
    prevStatusRef.current = status;

    if (!wasStreaming || !isNowReady) return;

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
  }, [status, validateCurrentFiles, setIsFixingErrors, append]);

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
        append,
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