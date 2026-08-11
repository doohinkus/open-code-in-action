import { notFound } from "next/navigation";
import { getShareData } from "@/lib/share";
import { getSiteUrl } from "@/lib/site-url";
import {
  renderOgImage,
  ShareOgImage,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
} from "@/lib/og-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const alt = "Shared React component generated with React Component Generator";
export const size = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT };
export const contentType = "image/png";

interface OgImageProps {
  params: Promise<{ token: string }>;
}

export default async function Image({ params }: OgImageProps) {
  const { token } = await params;
  const share = await getShareData(token);
  if (!share) {
    notFound();
  }
  const siteUrl = await getSiteUrl();
  return renderOgImage(
    <ShareOgImage name={share.name} files={share.files} url={siteUrl} />
  );
}
