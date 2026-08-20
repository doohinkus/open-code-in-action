"use client";

import { useInspection } from "@/lib/contexts/inspection-context";

interface InspectionOverlayProps {
  iframeRect: DOMRect | null;
}

export function InspectionOverlay({ iframeRect }: InspectionOverlayProps) {
  const { hoveredElement, isInspectMode } = useInspection();

  if (!isInspectMode || !hoveredElement || !iframeRect) return null;

  const overlayLeft = iframeRect.left + hoveredElement.rect.x;
  const overlayTop = iframeRect.top + hoveredElement.rect.y;

  return (
    <div
      className="fixed pointer-events-none z-50 border-2 border-primary bg-primary/10 rounded transition-all duration-100"
      style={{
        left: overlayLeft,
        top: overlayTop,
        width: hoveredElement.rect.width,
        height: hoveredElement.rect.height,
      }}
    >
      <div className="absolute -top-6 left-0 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded whitespace-nowrap font-sans shadow-sm">
        @{hoveredElement.label}
      </div>
    </div>
  );
}
