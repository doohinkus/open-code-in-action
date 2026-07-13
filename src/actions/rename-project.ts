"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function renameProject(projectId: string, newName: string) {
  const session = await getSession();
  
  if (!session) {
    throw new Error("Unauthorized");
  }

  const project = await prisma.project.update({
    where: {
      id: projectId,
      userId: session.userId,
    },
    data: {
      name: newName,
    },
  });

  return project;
}
