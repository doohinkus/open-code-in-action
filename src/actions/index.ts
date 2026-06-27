"use server";

import { prisma } from "@/lib/prisma";
import { deleteSession, getSession } from "@/lib/auth";
import { auth } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface AuthResult {
  success: boolean;
  error?: string;
}

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

export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    if (!email || !password) {
      return { success: false, error: "Email and password are required" };
    }
    if (password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters" };
    }
    const { data, error } = await auth.signUp.email({ email, name: email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    // User data from sign-up response — don't call getSession() in same cycle
    if (data?.user) {
      await ensureUser(data.user.id, data.user.email ?? email);
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Sign up error:", error);
    return { success: false, error: "An error occurred during sign up" };
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    if (!email || !password) {
      return { success: false, error: "Email and password are required" };
    }
    const { data, error } = await auth.signIn.email({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    // User data from sign-in response — don't call getSession() in same cycle
    if (data?.user) {
      await ensureUser(data.user.id, data.user.email ?? email);
    }
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Sign in error:", error);
    return { success: false, error: "An error occurred during sign in" };
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
