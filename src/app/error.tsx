"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/observability/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("error.boundary.caught", {
      message: error.message,
      digest: error.digest,
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="h-dvh w-full flex items-center justify-center p-8 bg-background">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 mb-4">
          <span className="text-2xl font-bold text-destructive">!</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          An unexpected error occurred while rendering this page.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
