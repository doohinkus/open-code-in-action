"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function saveProject(
  projectId: string,
  messages: any[],
  data: Record<string, any>
) {
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
      messages: JSON.stringify(messages),
      data: JSON.stringify(data),
    },
  });

  return project;
}
