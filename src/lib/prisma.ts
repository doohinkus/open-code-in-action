import { PrismaClient } from "@/generated/prisma";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let _prisma: PrismaClient | null = null;

export function getPrisma() {
  if (!_prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL environment variable is not set"
      );
    }
    const adapter = new PrismaNeonHttp(url, {});
    _prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = _prisma;
  }
  return _prisma;
}

export const prisma = new Proxy(
  {} as PrismaClient,
  {
    get(_, prop) {
      return (getPrisma() as any)[prop];
    },
  }
);