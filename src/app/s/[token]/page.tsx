import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SharedPreview } from "@/components/share/SharedPreview";

export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

interface SharePageProps {
  params: Promise<{ token: string }>;
}

interface ShareData {
  name: string;
  files: Record<string, string>;
}

async function getShare(token: string): Promise<ShareData | null> {
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

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) {
    return { title: "Shared component not found" };
  }
  return { title: `${share.name} · React Component Generator` };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const share = await getShare(token);
  if (!share) {
    notFound();
  }

  return (
    <div className="h-dvh flex flex-col bg-neutral-50">
      <header className="h-12 flex items-center justify-center border-b border-neutral-200/60 bg-white px-4 flex-shrink-0">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
        >
          Built with React Component Generator
        </Link>
      </header>
      <main className="flex-1 min-h-0 p-4">
        <SharedPreview files={share.files} name={share.name} />
      </main>
    </div>
  );
}
