"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/observability/logger";

export async function getProject(projectId: string) {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  try {
    const project = await prisma.project.findUnique({
      where: {
        id: projectId,
        userId: session.userId,
      },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    return {
      id: project.id,
      name: project.name,
      messages: JSON.parse(project.messages),
      data: JSON.parse(project.data),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  } catch (error) {
    logger.error("action.get_project.failed", {
      userId: session.userId,
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}