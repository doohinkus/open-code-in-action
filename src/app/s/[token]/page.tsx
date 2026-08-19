import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getShareData } from "@/lib/share";
import { siteName, siteTagline } from "@/lib/og-image";
import { getSiteUrl } from "@/lib/site-url";
import { SharedPreview } from "@/components/share/SharedPreview";
import { ShareActions } from "@/components/share/ShareActions";

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
    <div className="h-dvh flex flex-col bg-background">
      <header className="h-12 flex items-center justify-between border-b border-border bg-card px-4 flex-shrink-0">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Built with UI Generator
        </Link>
        <ShareActions files={share.files} />
      </header>
      <main className="flex-1 min-h-0 p-4">
        <SharedPreview files={share.files} name={share.name} />
      </main>
    </div>
  );
}
