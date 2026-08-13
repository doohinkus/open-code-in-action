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
import { setHasAnonWork, getOrCreateAnonSessionKey } from "@/lib/anon-work-tracker";
import { getStoredModel } from "@/lib/model-selector";
import { useToast } from "@/components/ui/toast";
import { mapErrorMessage } from "@/lib/chat-errors";

interface ChatContextProps {
  projectId?: string;
  initialMessages?: Message[];
}

interface ChatContextType {
  projectId?: string;
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
  generationInterrupted: boolean;
}

const STALL_TIMEOUT_MS = 130_000;

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
    vfsRevision,
  } = useFileSystem();

  const vfsRevisionRef = useRef(vfsRevision);
  vfsRevisionRef.current = vfsRevision;
  // The revision the server last acknowledged. Starts at -1 so the first
  // request always ships the full filesystem payload.
  const lastSyncedRevisionRef = useRef(-1);
  const anonSessionKeyRef = useRef<string | null>(null);

  const sessionKey = projectId ?? anonSessionKeyRef.current ?? getOrCreateAnonSessionKey();
  if (!projectId) anonSessionKeyRef.current = sessionKey;

  // Build a reduced request body: ship the full filesystem only when the
  // server cache is stale (revision mismatch). Messages go through the SDK.
  const experimental_prepareRequestBody = ({
    id,
    messages,
    requestData,
    requestBody,
  }: any) => {
    const isDirty = vfsRevisionRef.current !== lastSyncedRevisionRef.current;
    return {
      ...(requestBody as object),
      id,
      messages,
      ...(requestData !== undefined && { data: requestData }),
      projectId,
      sessionKey,
      model: getStoredModel(),
      vfsRevision: vfsRevisionRef.current,
      ...(isDirty && { files: fileSystem.serialize() }),
    };
  };

  // Transparently resend the full filesystem when the server asks for a
  // resync (cache miss after a cold start / TTL expiry), and track the last
  // acknowledged revision so we stop shipping files once the server is warm.
  const fetchWithVfsResync: typeof fetch = async (input, init) => {
    const response = await globalThis.fetch(input, init);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const sentRevision = body?.vfsRevision;
    if (response.status === 428 && body && sentRevision !== undefined) {
      const retried = await globalThis.fetch(input, {
        ...init,
        body: JSON.stringify({ ...body, files: fileSystem.serialize() }),
      });
      lastSyncedRevisionRef.current = sentRevision;
      return retried;
    }
    if (response.ok && sentRevision !== undefined) {
      lastSyncedRevisionRef.current = sentRevision;
    }
    return response;
  };

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
    fetch: fetchWithVfsResync,
    experimental_prepareRequestBody,
    onToolCall: ({ toolCall }) => {
      handleToolCall(toolCall);
    },
    onFinish: (message, options) => {
      const event = message as unknown as { finishReason?: string };
      const finishReason = event?.finishReason ?? options?.finishReason;
      setGenerationInterrupted(finishReason === "unknown");
    },
  });

  const fixAttemptCount = useRef(0);
  const prevStatusRef = useRef(status);
  const [generationTimedOut, setGenerationTimedOut] = useState(false);
  const [generationInterrupted, setGenerationInterrupted] = useState(false);
  const { toast } = useToast();
  const prevErrorStatusRef = useRef(status);

  // Surface stream errors and timeouts as toasts regardless of which tab is
  // mounted (ChatInterface unmounts on mobile when the user is auto-switched
  // to the Preview tab mid-generation).
  useEffect(() => {
    if (prevErrorStatusRef.current !== "error" && status === "error" && error) {
      toast(mapErrorMessage(error.message), "error");
    }
    prevErrorStatusRef.current = status;
  }, [status, error, toast]);

  useEffect(() => {
    if (generationTimedOut) {
      toast("Generation timed out. Please try again.", "error");
    }
  }, [generationTimedOut, toast]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      fixAttemptCount.current = 0;
      setGenerationTimedOut(false);
      setGenerationInterrupted(false);
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
    if (generationTimedOut || generationInterrupted) {
      setIsFixingErrors(false);
      return;
    }

    const errors = validateCurrentFiles();
    if (errors.length > 0 && fixAttemptCount.current < 1) {
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
  }, [status, validateCurrentFiles, setIsFixingErrors, append, generationTimedOut, generationInterrupted]);

  // Track anonymous work
  useEffect(() => {
    if (!projectId && messages.length > 0) {
      setHasAnonWork(messages, fileSystem.serialize());
    }
  }, [messages, fileSystem, projectId]);

  return (
    <ChatContext.Provider
      value={{
        projectId,
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
        generationInterrupted,
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