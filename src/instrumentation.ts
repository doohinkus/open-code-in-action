import * as Sentry from "@sentry/nextjs";
import { registerOtel } from "./lib/otel";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // OTel first: Sentry then nests its spans under the active OTel context
    // instead of competing for the same request span. No-op unless
    // OTEL_EXPORTER_OTLP_ENDPOINT is set.
    registerOtel();
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
