import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        dim,
        className
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v4" />
        <path d="M12 17v4" />
        <path d="M5 8.5 12 12l7-3.5" />
        <path d="M5 15.5 12 12l7 3.5" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}
