import { renderOgImage, SiteOgImage, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from "@/lib/og-image";

export const alt = "React Component Generator — describe a UI and ship React in seconds";
export const size = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT };
export const contentType = "image/png";

export default async function Image() {
  return renderOgImage(<SiteOgImage />);
}
