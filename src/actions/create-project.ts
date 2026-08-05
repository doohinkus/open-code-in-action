"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/observability/logger";

interface CreateProjectInput {
  name: string;
  messages: any[];
  data: Record<string, any>;
}

export async function createProject(input: CreateProjectInput) {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  try {
    const project = await prisma.project.create({
      data: {
        name: input.name,
        userId: session.userId,
        messages: JSON.stringify(input.messages),
        data: JSON.stringify(input.data),
      },
    });

    return project;
  } catch (error) {
    logger.error("action.create_project.failed", {
      userId: session.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}