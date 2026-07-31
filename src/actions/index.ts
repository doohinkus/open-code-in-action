"use server";

import { prisma } from "@/lib/prisma";
import { deleteSession, getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function ensureUser(sessionUserId: string, email: string) {
  const existing = await prisma.user.findUnique({
    where: { id: sessionUserId },
  });
  if (!existing) {
    await prisma.user.create({
      data: { id: sessionUserId, email },
    });
  }
}

export async function signOut() {
  try {
    await deleteSession();
  } catch {
    // ignore session delete errors
  }
  revalidatePath("/");
  redirect("/");
}

export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  try {
    await ensureUser(session.userId, session.email);
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, createdAt: true },
    });
    return user;
  } catch (error) {
    console.error("Get user error:", error);
    return null;
  }
}
