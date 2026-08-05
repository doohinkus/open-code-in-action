"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/observability/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("error.global_boundary.caught", {
      message: error.message,
      digest: error.digest,
    });
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="h-dvh flex items-center justify-center bg-neutral-50">
        <div className="text-center max-w-md p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <span className="text-2xl font-bold text-red-600">!</span>
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-neutral-500 mb-4">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
