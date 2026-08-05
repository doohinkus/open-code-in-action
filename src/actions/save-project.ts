"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/observability/logger";

export async function saveProject(
  projectId: string,
  messages: any[],
  data: Record<string, any>
) {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  try {
    const project = await prisma.project.update({
      where: {
        id: projectId,
        userId: session.userId,
      },
      data: {
        messages: JSON.stringify(messages),
        data: JSON.stringify(data),
      },
    });

    return project;
  } catch (error) {
    logger.error("action.save_project.failed", {
      userId: session.userId,
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
