import "server-only";
import { getAuth } from "./auth/server";

export interface SessionPayload {
  userId: string;
  email: string;
  expiresAt: Date;
}

export async function getSession(): Promise<SessionPayload | null> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    expiresAt: new Date(),
  };
}

export async function deleteSession() {
  await getAuth().signOut();
}
