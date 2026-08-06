import { Loader2 } from "lucide-react";

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200/70 ${className}`}
    />
  );
}

export function LoadingScreen() {
  return (
    <main
      className="flex flex-col h-dvh w-full overflow-hidden bg-neutral-50"
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading your workspace…</span>

      {/* Top Bar */}
      <div className="h-14 flex items-center justify-between gap-2 px-4 md:px-6 border-b border-neutral-200/60 bg-white flex-shrink-0">
        <Skeleton className="h-4 w-44" />
        <div className="hidden lg:flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="lg:hidden h-8 w-8 rounded-full" />
      </div>

      {/* Mobile: tab pills + stacked skeleton */}
      <div className="md:hidden flex flex-col flex-1 min-h-0">
        <div className="px-4 py-2 border-b border-neutral-200/60 bg-white flex-shrink-0">
          <div className="flex gap-1 h-9 w-full rounded-lg bg-neutral-100 border border-neutral-200/60 p-0.5">
            <Skeleton className="flex-1 h-full rounded-md" />
            <Skeleton className="flex-1 h-full rounded-md" />
            <Skeleton className="flex-1 h-full rounded-md" />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-3 p-4 bg-neutral-50 overflow-hidden">
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-14 w-5/6" />
        </div>
        <div className="p-4 border-t border-neutral-200/60 bg-white flex-shrink-0">
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      </div>

      {/* Desktop: 3-pane skeleton */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Chat pane (35%) */}
        <div className="flex-[0.35] h-full flex flex-col bg-white min-w-0">
          <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-14 w-5/6" />
            <Skeleton className="h-10 w-2/3" />
          </div>
          <div className="p-4 border-t border-neutral-200/60 flex-shrink-0">
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-neutral-200 flex-shrink-0" />

        {/* Preview pane (65%) */}
        <div className="flex-[0.65] h-full flex flex-col bg-white min-w-0">
          <div className="h-14 flex items-center gap-2 px-4 border-b border-neutral-200/60 bg-neutral-50/50 flex-shrink-0">
            <div className="flex gap-1 h-9 p-0.5 rounded-lg bg-white/60 border border-neutral-200/60">
              <Skeleton className="h-full w-20 rounded-md" />
              <Skeleton className="h-full w-14 rounded-md" />
            </div>
            <div className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-neutral-50/50">
            <Loader2 className="h-14 w-14 text-neutral-400 animate-spin" aria-hidden="true" />
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
