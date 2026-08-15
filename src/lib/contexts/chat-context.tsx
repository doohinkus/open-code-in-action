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
import {
  STALL_TIMEOUT_MS,
  RESOURCE_WARNING_TIMEOUT_MS,
  TOAST_WARNING_DURATION_MS,
} from "@/lib/constants";

/**
 * Props for the ChatProvider component.
 */
interface ChatContextProps {
  projectId?: string;
  initialMessages?: Message[];
}

/**
 * Context type for chat functionality.
 * Provides access to messages, input handling, status, and control methods.
 */
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

// Zen's free tier dies mid-stream with an idle timeout (e.g. "Streaming
// response failed: [504] Upstream idle timeout exceeded") or ends the stream
// with no finish reason. Both are transient — one automatic retry usually
// succeeds once the rate-limit window resets or the chain rotates models.
function isProviderTimeoutError(raw: string): boolean {
  return /upstream idle|idle timeout|\[504\]|timed out|finishReason.{0,20}unknown|"unknown"/i.test(raw);
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

/**
 * Provider component for chat functionality.
 * Manages conversation state, AI streaming, auto-retry on failures,
 * and resource usage warnings.
 */
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

  const sessionKey = projectId ? undefined : (anonSessionKeyRef.current ?? getOrCreateAnonSessionKey());
  if (sessionKey) anonSessionKeyRef.current = sessionKey;

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
      // Only acknowledge the revision once the resync request actually
      // succeeded; otherwise the next request will ship the full payload
      // again (and avoid marking a failed retry as clean).
      if (retried.ok && sentRevision !== undefined) {
        lastSyncedRevisionRef.current = sentRevision;
      }
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
  // reload from useChat is recreated on every render (its useCallback deps
  // change with each throttled stream update), so keep the latest in a ref.
  // Scheduling the auto-retry timer through a ref avoids the effect's own
  // cleanup cancelling it on unrelated re-renders.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  // One transparent retry per user turn when the free provider times out
  // mid-stream; the user can still retry manually afterwards.
  const autoRetriedRef = useRef(false);
  // True when the user (or the stall watchdog) stopped generation explicitly —
  // never auto-retry after an explicit stop.
  const userStoppedRef = useRef(false);
  // True once the "long generation" warning toast has fired this turn.
  const resourceWarnedRef = useRef(false);
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

  // Transparently retry once when the provider errors out mid-stream with an
  // idle timeout / 504. reload() drops the last (partial) assistant message
  // and re-sends the last user message, so this is equivalent to a manual
  // retry — it just happens automatically. deps are deliberately limited to
  // [status, error] so unrelated re-renders can't cancel the pending timer.
  useEffect(() => {
    if (status !== "error" || !error || autoRetriedRef.current) return;
    if (userStoppedRef.current || !isProviderTimeoutError(error.message)) return;
    autoRetriedRef.current = true;
    const timer = setTimeout(() => {
      reloadRef.current();
    }, 800);
    return () => clearTimeout(timer);
  }, [status, error]);

  // Same recovery for streams that end with finishReason "unknown" (the Zen
  // connection drops without an explicit error part).
  useEffect(() => {
    if (!generationInterrupted || autoRetriedRef.current) return;
    if (userStoppedRef.current || generationTimedOut) return;
    autoRetriedRef.current = true;
    const timer = setTimeout(() => {
      reloadRef.current();
    }, 800);
    return () => clearTimeout(timer);
  }, [generationInterrupted, generationTimedOut]);

  const handleStop = useCallback(() => {
    userStoppedRef.current = true;
    stop();
  }, [stop]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      fixAttemptCount.current = 0;
      autoRetriedRef.current = false;
      userStoppedRef.current = false;
      resourceWarnedRef.current = false;
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
      handleStop();
      setGenerationTimedOut(true);
    }, STALL_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [status, messages, handleStop]);

  // Resource-usage warning: after RESOURCE_WARNING_TIMEOUT_MS of a generation,
  // nudge the user to stop or simplify. Fires once per turn and is NOT reset
  // by stream activity, so long real-provider generations get a heads-up while
  // it's still easy to cancel.
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") return;

    const timer = setTimeout(() => {
      if (resourceWarnedRef.current) return;
      resourceWarnedRef.current = true;
      toast(
        "This component is using lots of AI resources—consider using the red stop button and simplifying.",
        "info",
        TOAST_WARNING_DURATION_MS
      );
    }, RESOURCE_WARNING_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [status, toast]);

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
        stop: handleStop,
        requestFix,
        generationTimedOut,
        generationInterrupted,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

/**
 * Hook to access chat context.
 * Must be used within a ChatProvider.
 *
 * @returns ChatContextType with messages, input, status, and control methods
 * @throws Error if used outside ChatProvider
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}