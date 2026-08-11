import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShareData } from "@/lib/share";
import { siteName, siteTagline } from "@/lib/og-image";
import { getSiteUrl } from "@/lib/site-url";
import { SharedPreview } from "@/components/share/SharedPreview";

export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    return { title: "Shared component not found" };
  }

  const share = await getShareData(token);
  if (!share) {
    return { title: "Shared component not found" };
  }

  const siteUrl = await getSiteUrl();
  const pageUrl = `${siteUrl}/s/${token}`;
  const imageUrl = `${pageUrl}/opengraph-image`;
  const title = share.name;

  return {
    title,
    description: siteTagline,
    openGraph: {
      type: "website",
      siteName,
      title,
      description: siteTagline,
      url: pageUrl,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: siteTagline,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: share.name }],
    },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const share = await getShareData(token);
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
