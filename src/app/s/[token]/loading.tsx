import { Loader2 } from "lucide-react";

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
    />
  );
}

export default function ShareLoading() {
  return (
    <div
      className="h-dvh flex flex-col bg-background"
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading shared preview…</span>

      <div className="h-12 flex items-center justify-between border-b border-border bg-card px-4 flex-shrink-0">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <main className="flex-1 min-h-0 p-4">
        <div className="h-full w-full bg-card border border-border rounded-lg overflow-hidden shadow-sm flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 text-primary animate-spin" aria-hidden="true" />
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </main>
    </div>
  );
}
