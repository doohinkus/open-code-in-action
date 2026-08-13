"use client";

import React, { useEffect, useRef } from "react";
import { useChat } from "@/lib/contexts/chat-context";
import { Loader2, Check } from "lucide-react";

interface ActivityEntry {
  id: string;
  label: string;
  status: "in-progress" | "done";
}

function getToolLabel(toolName: string, args: any): string {
  if (!args) return toolName;

  const { command, path, new_path } = args as {
    command?: string;
    path?: string;
    new_path?: string;
  };

  if (toolName === "str_replace_editor") {
    switch (command) {
      case "create":
        return `Creating ${path}`;
      case "str_replace":
        return `Editing ${path}`;
      case "insert":
        return `Editing ${path}`;
      case "view":
        return `Viewing ${path}`;
      default:
        return `Editing ${path}`;
    }
  }

  if (toolName === "file_manager") {
    if (command === "rename") {
      return `Renaming ${path} → ${new_path}`;
    }
    if (command === "delete") {
      return `Deleting ${path}`;
    }
  }

  return `${toolName} ${path || ""}`;
}

function extractActivities(messages: any[]): ActivityEntry[] {
  const activities: ActivityEntry[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.parts) continue;

    for (const part of msg.parts) {
      if (part.type !== "tool-invocation") continue;

      const tool = part.toolInvocation;
      const id = tool.toolCallId;
      const label = getToolLabel(tool.toolName, tool.args);
      const status = tool.state === "result" ? "done" : "in-progress";

      activities.push({ id, label, status });
    }
  }

  return activities;
}

export function GenerationActivityLog() {
  const { messages } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const [, forceUpdate] = React.useState(0);

  const activities = extractActivities(messages);
  const totalSteps = activities.length;
  const completedCount = activities.filter((a) => a.status === "done").length;

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, [messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities.length]);

  useEffect(() => {
    if (totalSteps > 0) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [totalSteps]);

  if (totalSteps === 0) {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return (
      <div className="flex items-center gap-2 mt-3 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">
          Preparing...
          {elapsed > 0 && (
            <span className="ml-1 text-gray-400">({elapsed}s)</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto text-left">
      <div className="text-xs text-gray-400 mb-2">
        Step {completedCount} of {totalSteps}
      </div>
      <div
        ref={scrollRef}
        className="max-h-48 overflow-y-auto space-y-1.5 pr-1"
      >
        {activities.map((activity, index) => (
          <div
            key={`${activity.id}-${index}`}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-white/60 rounded-md border border-gray-100"
          >
            {activity.status === "done" ? (
              <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-blue-500 flex-shrink-0" />
            )}
            <span className="text-xs font-mono text-gray-600 truncate">
              {activity.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
