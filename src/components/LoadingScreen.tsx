import { Loader2 } from "lucide-react";

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
    />
  );
}

export function LoadingScreen() {
  return (
    <main
      className="flex flex-col h-dvh w-full overflow-hidden bg-background"
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading your workspace…</span>

      <div className="h-14 flex items-center justify-between gap-2 px-4 md:px-6 border-b border-border bg-card flex-shrink-0">
        <Skeleton className="h-4 w-44" />
        <div className="hidden lg:flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <Skeleton className="lg:hidden h-8 w-8 rounded-full" />
      </div>

      <div className="md:hidden flex flex-col flex-1 min-h-0">
        <div className="px-4 py-2 border-b border-border bg-card flex-shrink-0">
          <div className="flex gap-1 h-9 w-full rounded-lg bg-muted border border-border p-0.5">
            <Skeleton className="flex-1 h-full rounded-md" />
            <Skeleton className="flex-1 h-full rounded-md" />
            <Skeleton className="flex-1 h-full rounded-md" />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-3 p-4 bg-muted/30 overflow-hidden">
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-14 w-5/6" />
        </div>
        <div className="p-4 border-t border-border bg-card flex-shrink-0">
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      </div>

      <div className="hidden md:flex flex-1 min-h-0">
        <div className="flex-[0.35] h-full flex flex-col bg-card min-w-0 border-r border-border">
          <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-14 w-5/6" />
            <Skeleton className="h-10 w-2/3" />
          </div>
          <div className="p-4 border-t border-border flex-shrink-0">
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        </div>

        <div className="flex-[0.65] h-full flex flex-col bg-card min-w-0">
          <div className="h-14 flex items-center gap-2 px-4 border-b border-border bg-muted/30 flex-shrink-0">
            <div className="flex gap-1 h-9 p-0.5 rounded-lg bg-background/80 border border-border">
              <Skeleton className="h-full w-20 rounded-md" />
              <Skeleton className="h-full w-14 rounded-md" />
            </div>
            <div className="flex-1" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-muted/20">
            <Loader2 className="h-14 w-14 text-primary animate-spin" aria-hidden="true" />
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
