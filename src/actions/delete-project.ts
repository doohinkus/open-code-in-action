"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function deleteProject(projectId: string) {
  const session = await getSession();
  
  if (!session) {
    throw new Error("Unauthorized");
  }

  await prisma.project.delete({
    where: {
      id: projectId,
      userId: session.userId,
    },
  });

  revalidatePath("/");
}
