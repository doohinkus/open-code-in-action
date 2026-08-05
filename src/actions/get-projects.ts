"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/observability/logger";

export async function getProjects() {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  try {
    const projects = await prisma.project.findMany({
      where: {
        userId: session.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return projects;
  } catch (error) {
    logger.error("action.get_projects.failed", {
      userId: session.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}