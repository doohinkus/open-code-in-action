import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", db: "ok" },
      { status: 200 }
    );
  } catch {
    return Response.json(
      { status: "degraded", db: "error" },
      { status: 503 }
    );
  }
}
