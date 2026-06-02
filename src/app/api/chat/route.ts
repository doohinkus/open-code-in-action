import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, appendResponseMessages } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";

function hasRealProvider(): boolean {
  return !!(process.env.GOOGLE_API_KEY?.trim()) ||
         !!(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim() !== "your-api-key-here") ||
         !!(process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() && process.env.OPENAI_COMPATIBLE_MODEL?.trim());
}

function isUsingAnthropic(): boolean {
  return !process.env.GOOGLE_API_KEY?.trim() &&
         !process.env.OPENAI_COMPATIBLE_BASE_URL?.trim() &&
         !!(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_API_KEY?.trim() !== "your-api-key-here");
}

export async function POST(req: Request) {
  const {
    messages,
    files,
    projectId,
  }: { messages: any[]; files: Record<string, FileNode>; projectId?: string } =
    await req.json();

  messages.unshift({
    role: "system",
    content: generationPrompt,
    ...(isUsingAnthropic() ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } } : {}),
  });

  // Reconstruct the VirtualFileSystem from serialized data
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  // Use fewer steps for mock provider to prevent repetition
  const maxSteps = hasRealProvider() ? 40 : 4;
  const result = streamText({
    model,
    messages,
    maxTokens: 10_000,
    maxSteps,
    onError: (err: any) => {
      console.error(err);
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    onFinish: async ({ response }) => {
      // Save to project if projectId is provided and user is authenticated
      if (projectId) {
        try {
          // Check if user is authenticated
          const session = await getSession();
          if (!session) {
            console.error("User not authenticated, cannot save project");
            return;
          }

          // Get the messages from the response
          const responseMessages = response.messages || [];
          // Combine original messages with response messages
          const allMessages = appendResponseMessages({
            messages: [...messages.filter((m) => m.role !== "system")],
            responseMessages,
          });

          await prisma.project.update({
            where: {
              id: projectId,
              userId: session.userId,
            },
            data: {
              messages: JSON.stringify(allMessages),
              data: JSON.stringify(fileSystem.serialize()),
            },
          });
        } catch (error) {
          console.error("Failed to save project data:", error);
        }
      }
    },
  });

  return result.toDataStreamResponse();
}

export const maxDuration = 120;
