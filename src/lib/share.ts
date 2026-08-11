import "server-only";
import { prisma } from "@/lib/prisma";
import {
  MAX_SHARE_NAME_LENGTH,
  parseShareFiles,
  validateShareInput,
  generateShareToken,
  ShareInput,
} from "@/lib/share-utils";

export {
  MAX_SHARE_FILES_COUNT,
  MAX_SHARE_FILE_SIZE,
  MAX_SHARE_NAME_LENGTH,
  parseShareFiles,
  validateShareInput,
  generateShareToken,
} from "@/lib/share-utils";
export type { ShareInput } from "@/lib/share-utils";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface ShareData {
  name: string;
  files: Record<string, string>;
}

export async function getShareData(token: string): Promise<ShareData | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const share = await prisma.share.findUnique({ where: { token } });
  if (!share) return null;

  let files: Record<string, string> = {};
  try {
    const parsed = JSON.parse(share.data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      files = parsed;
    }
  } catch {
    files = {};
  }

  return { name: share.name, files };
}

export async function shareOwnerProjectId(
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  return !!project;
}

export async function upsertShare(input: ShareInput & { userId?: string }): Promise<{
  token: string;
  created: boolean;
}> {
  const name = input.name?.trim().slice(0, MAX_SHARE_NAME_LENGTH) || "Shared component";
  const data = JSON.stringify(input.files);

  // 1. Update an existing share via its capability token.
  if (input.previousToken) {
    const existing = await prisma.share.findUnique({
      where: { token: input.previousToken },
    });

    if (existing) {
      // If the existing share is attached to a project, only its owner may update it.
      if (existing.projectId && input.userId) {
        const ownsProject = await shareOwnerProjectId(existing.projectId, input.userId);
        if (!ownsProject) {
          throw new Error("Cannot update a share owned by another user");
        }
      }

      await prisma.share.update({
        where: { id: existing.id },
        data: {
          data,
          name,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
      });
      return { token: existing.token, created: false };
    }
  }

  // 2. For authenticated users, keep one stable share per project.
  if (input.projectId && input.userId) {
    const ownsProject = await shareOwnerProjectId(input.projectId, input.userId);
    if (ownsProject) {
      const existing = await prisma.share.findFirst({
        where: { projectId: input.projectId },
      });

      if (existing) {
        await prisma.share.update({
          where: { id: existing.id },
          data: { data, name },
        });
        return { token: existing.token, created: false };
      }
    }
  }

  // 3. Otherwise create a new share.
  const token = generateShareToken();
  await prisma.share.create({
    data: {
      token,
      name,
      data,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
  });
  return { token, created: true };
}
