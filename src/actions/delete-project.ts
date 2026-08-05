"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/observability/logger";

export async function deleteProject(projectId: string) {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  try {
    await prisma.project.delete({
      where: {
        id: projectId,
        userId: session.userId,
      },
    });
  } catch (error) {
    logger.error("action.delete_project.failed", {
      userId: session.userId,
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  revalidatePath("/");
}
