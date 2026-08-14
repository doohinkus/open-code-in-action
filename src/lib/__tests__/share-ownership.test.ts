import { test, expect, describe, vi, beforeEach } from "vitest";
import { upsertShare, shareOwnerProjectId } from "@/lib/share";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    share: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const shareMock = prisma.share as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const projectMock = prisma.project as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
};

const FILES = { "/App.jsx": "export default () => null" };

function makeShareRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-1",
    token: "token-abc",
    name: "Shared component",
    data: JSON.stringify(FILES),
    projectId: null,
    ...overrides,
  };
}

describe("upsertShare ownership enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("denies anonymous caller updating a project-attached share", async () => {
    shareMock.findUnique.mockResolvedValue(
      makeShareRow({ projectId: "project-1" })
    );

    await expect(
      upsertShare({ files: FILES, previousToken: "token-abc" })
    ).rejects.toThrow("Cannot update a share owned by another user");
    expect(shareMock.update).not.toHaveBeenCalled();
  });

  test("denies non-owner updating a project-attached share", async () => {
    shareMock.findUnique.mockResolvedValue(
      makeShareRow({ projectId: "project-1" })
    );
    projectMock.findFirst.mockResolvedValue(null);

    await expect(
      upsertShare({ files: FILES, previousToken: "token-abc", userId: "user-1" })
    ).rejects.toThrow("Cannot update a share owned by another user");
    expect(shareMock.update).not.toHaveBeenCalled();
  });

  test("allows owner updating a project-attached share", async () => {
    shareMock.findUnique.mockResolvedValue(
      makeShareRow({ projectId: "project-1" })
    );
    projectMock.findFirst.mockResolvedValue({ id: "project-1" });

    const result = await upsertShare({
      files: FILES,
      previousToken: "token-abc",
      projectId: "project-1",
      userId: "user-1",
    });

    expect(result).toEqual({ token: "token-abc", created: false });
    expect(shareMock.update).toHaveBeenCalledTimes(1);
    expect(shareMock.create).not.toHaveBeenCalled();
  });

  test("anonymous new share cannot be attached to a project", async () => {
    shareMock.findUnique.mockResolvedValue(null);
    shareMock.findFirst.mockResolvedValue(null);
    shareMock.create.mockResolvedValue(makeShareRow());

    const result = await upsertShare({
      files: FILES,
      projectId: "project-1",
    });

    expect(result.created).toBe(true);
    const createdArgs = shareMock.create.mock.calls[0][0];
    expect(createdArgs.data).not.toHaveProperty("projectId");
  });

  test("owner's new share is attached to the project", async () => {
    shareMock.findUnique.mockResolvedValue(null);
    shareMock.findFirst.mockResolvedValue(null);
    projectMock.findFirst.mockResolvedValue({ id: "project-1" });
    shareMock.create.mockResolvedValue(makeShareRow());

    const result = await upsertShare({
      files: FILES,
      projectId: "project-1",
      userId: "user-1",
    });

    expect(result.created).toBe(true);
    const createdArgs = shareMock.create.mock.calls[0][0];
    expect(createdArgs.data).toHaveProperty("projectId", "project-1");
  });

  test("non-owner's new share is not attached to the project", async () => {
    shareMock.findUnique.mockResolvedValue(null);
    shareMock.findFirst.mockResolvedValue(null);
    projectMock.findFirst.mockResolvedValue(null);
    shareMock.create.mockResolvedValue(makeShareRow());

    const result = await upsertShare({
      files: FILES,
      projectId: "project-1",
      userId: "user-1",
    });

    expect(result.created).toBe(true);
    const createdArgs = shareMock.create.mock.calls[0][0];
    expect(createdArgs.data).not.toHaveProperty("projectId");
  });

  test("shareOwnerProjectId returns true only for the owner", async () => {
    projectMock.findFirst.mockResolvedValue({ id: "project-1" });
    await expect(shareOwnerProjectId("project-1", "user-1")).resolves.toBe(true);

    projectMock.findFirst.mockResolvedValue(null);
    await expect(shareOwnerProjectId("project-1", "user-2")).resolves.toBe(false);
  });
});
