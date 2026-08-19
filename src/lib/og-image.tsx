import "server-only";
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import { siteUrlFallback } from "@/lib/site-url";

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const siteName = "UI Generator";
export const siteTagline =
  "Describe a UI in plain English and get production-ready React components in seconds.";

export const FONT_STACK = "Geist, Noto Sans, sans-serif";
export const MONO_STACK = "Geist, Noto Sans, monospace";

const GOOGLE_FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: "normal";
}

let cachedFonts: OgFont[] | null | undefined;

async function getGeistFonts(): Promise<OgFont[] | undefined> {
  if (cachedFonts !== null && cachedFonts !== undefined) return cachedFonts;

  const fonts: OgFont[] = [];
  try {
    const css = await fetch(GOOGLE_FONTS_CSS, {
      headers: { "user-agent": CHROME_UA },
    }).then((res) => res.text());

    const faceRegex = /@font-face\s*{([^}]*)}/g;
    let match: RegExpExecArray | null;
    while ((match = faceRegex.exec(css)) !== null) {
      const block = match[1];
      const familyMatch = /font-family:\s*['"]?Geist['"]?/i.exec(block);
      if (!familyMatch) continue;

      // Keep only the latin subset so we fetch a single file per weight.
      const rangeMatch = /unicode-range:\s*([^;]+)/i.exec(block);
      if (rangeMatch && !/U\+0?-0{4}/i.test(rangeMatch[1])) continue;

      const weightMatch = /font-weight:\s*(\d+)/.exec(block);
      const weight = Number(weightMatch?.[1] ?? 400) as OgFont["weight"];
      if (![400, 500, 600, 700].includes(weight)) continue;

      const urlMatch = /url\(([^)]+)\)/.exec(block);
      if (!urlMatch) continue;

      const data = await fetch(urlMatch[1]).then((res) => res.arrayBuffer());
      fonts.push({ name: "Geist", data, weight, style: "normal" });
    }
  } catch {
    // Fall back to the bundled Noto Sans font.
  }

  cachedFonts = fonts.length > 0 ? fonts : undefined;
  return cachedFonts;
}

export async function renderOgImage(children: ReactElement): Promise<ImageResponse> {
  const fonts = await getGeistFonts();
  return new ImageResponse(children, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    ...(fonts && fonts.length ? { fonts } : {}),
  });
}

const rootStyle = (): React.CSSProperties => ({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(160deg, #0a0a0b 0%, #101014 55%, #16161c 100%)",
  color: "#fafafa",
  fontFamily: FONT_STACK,
});

const glowStyle = (): React.CSSProperties => ({
  position: "absolute",
  top: "-240px",
  right: "-160px",
  width: "720px",
  height: "720px",
  borderRadius: "9999px",
  background:
    "radial-gradient(circle, rgba(99,102,241,0.32) 0%, rgba(56,189,248,0.10) 45%, rgba(0,0,0,0) 70%)",
});

const gridStyle = (): React.CSSProperties => ({
  position: "absolute",
  inset: "0px",
  opacity: "0.5",
  background:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 72px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 72px)",
});

const logoMarkStyle = (): React.CSSProperties => ({
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #0d9488 0%, #10b981 100%)",
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 700,
  fontFamily: MONO_STACK,
});

function BrandHeader({ fileCount }: { fileCount?: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "18px" }}>
        <div style={logoMarkStyle()}>UI</div>
        <div
          style={{
            fontSize: "26px",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "#e5e5e5",
          }}
        >
          UI Generator
        </div>
      </div>
      {typeof fileCount === "number" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 20px",
            borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            fontSize: "20px",
            fontWeight: 500,
            color: "#a1a1aa",
          }}
        >
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function BrandFooter({ url }: { url: string }) {
  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        paddingTop: "28px",
      }}
    >
      <div style={{ fontSize: "22px", fontWeight: 500, color: "#a1a1aa" }}>
        Built with UI Generator
      </div>
      <div
        style={{
          fontSize: "22px",
          fontFamily: MONO_STACK,
          color: "#71717a",
        }}
      >
        {displayUrl}
      </div>
    </div>
  );
}

function EyebrowPill({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "12px",
        alignSelf: "flex-start",
        padding: "10px 22px",
        borderRadius: "9999px",
        border: "1px solid rgba(13,148,136,0.45)",
        background: "rgba(13,148,136,0.12)",
        fontSize: "20px",
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "#5eead4",
      }}
    >
      <span
        style={{
          width: "10px",
          height: "10px",
          borderRadius: "9999px",
          background: "#14b8a6",
        }}
      />
      {children}
    </div>
  );
}

export function SiteOgImage({ url = siteUrlFallback }: { url?: string }) {
  return (
    <div style={rootStyle()}>
      <div style={glowStyle()} />
      <div style={gridStyle()} />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "space-between",
          padding: "84px 96px",
        }}
      >
        <BrandHeader />
        <div style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "880px" }}>
          <EyebrowPill>AI Component Generator</EyebrowPill>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "92px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.04,
              color: "#fafafa",
            }}
          >
            Describe a UI.{"\n"}Ship React in seconds.
          </div>
          <div
            style={{
              fontSize: "34px",
              fontWeight: 400,
              lineHeight: 1.35,
              color: "#a1a1aa",
              maxWidth: "760px",
            }}
          >
            Turn plain-English prompts into production-ready React + Tailwind
            components. Preview instantly, share a permalink, export the code.
          </div>
        </div>
        <BrandFooter url={url} />
      </div>
    </div>
  );
}

const POSSIBLE_ENTRIES = [
  "/App.jsx",
  "/App.tsx",
  "/index.jsx",
  "/index.tsx",
  "/src/App.jsx",
  "/src/App.tsx",
];

function pickEntry(files: Record<string, string>): { path: string; content: string } | null {
  const paths = Object.keys(files);
  if (paths.length === 0) return null;
  const entry =
    POSSIBLE_ENTRIES.find((path) => files[path] !== undefined) ??
    paths.find((path) => path.endsWith(".jsx") || path.endsWith(".tsx"));
  if (!entry) return null;
  return { path: entry, content: files[entry] };
}

function snippetFor(content: string, maxLines = 10, maxLineLength = 92): string {
  return content
    .split("\n")
    .slice(0, maxLines)
    .map((line) => (line.length > maxLineLength ? line.slice(0, maxLineLength) + "…" : line))
    .join("\n");
}

function CodeCard({ path, content }: { path: string; content: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: "18px",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "#0b0b0f",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "14px",
          padding: "18px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        {["#f87171", "#fbbf24", "#34d399"].map((color) => (
          <span
            key={color}
            style={{ width: "14px", height: "14px", borderRadius: "9999px", background: color, opacity: 0.9 }}
          />
        ))}
        <div
          style={{
            fontSize: "22px",
            fontFamily: MONO_STACK,
            color: "#8b8b96",
            marginLeft: "8px",
          }}
        >
          {path}
        </div>
      </div>
      <div
        style={{
          padding: "28px 30px",
          fontSize: "24px",
          fontFamily: MONO_STACK,
          lineHeight: 1.6,
          color: "#d4d4d8",
          whiteSpace: "pre",
        }}
      >
        {snippetFor(content)}
      </div>
    </div>
  );
}

export function ShareOgImage({
  name,
  files,
  url = siteUrlFallback,
}: {
  name: string;
  files: Record<string, string>;
  url?: string;
}) {
  const entry = pickEntry(files);
  const fileCount = Object.keys(files).length;

  return (
    <div style={rootStyle()}>
      <div style={glowStyle()} />
      <div style={gridStyle()} />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "space-between",
          gap: "48px",
          padding: "76px 88px",
        }}
      >
        <BrandHeader fileCount={fileCount} />
        <div style={{ display: "flex", flexDirection: "column", gap: "28px", minWidth: "0" }}>
          <EyebrowPill>Shared component</EyebrowPill>
          <div
            style={{
              fontSize: "72px",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.05,
              color: "#fafafa",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
        </div>
        {entry ? (
          <CodeCard path={entry.path} content={entry.content} />
        ) : (
          <div
            style={{
              fontSize: "28px",
              color: "#a1a1aa",
              padding: "40px 48px",
              borderRadius: "18px",
              border: "1px dashed rgba(255,255,255,0.16)",
            }}
          >
            This share is empty.
          </div>
        )}
        <BrandFooter url={url} />
      </div>
    </div>
  );
}
