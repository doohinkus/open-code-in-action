// Server-side OpenTelemetry bootstrap for @vercel/otel → Grafana Tempo.
// Registration is env-gated: with no OTEL_EXPORTER_OTLP_ENDPOINT configured
// (local dev, vitest, bare builds) registerOtel() is a no-op and nothing is
// instrumented — matching the Sentry "builds succeed without any config"
// posture. Called from src/instrumentation.ts before the Sentry server
// config loads, so request spans come from OTel and Sentry nests under it.
//
// This module is imported by server code only. The logger stays OTel-free
// by design: it is bundled into client components, so trace correlation is
// injected via setTraceContextSource() from here instead.
import "server-only";
import { registerOTel } from "@vercel/otel";
import { context, trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { setTraceContextSource } from "@/lib/observability/logger";

let registered = false;

export function registerOtel(): void {
  if (registered) return;
  registered = true;

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || "uigen",
  });

  // Attach trace_id/span_id of the active span to every JSON log line, so
  // Tempo spans and Loki/app logs correlate. No active span (or the no-op
  // tracer before registration) → no fields.
  setTraceContextSource(() => {
    const span = trace.getSpan(context.active());
    if (!span) return undefined;
    const { traceId, spanId } = span.spanContext();
    if (!isValidSpanId(traceId)) return undefined;
    return { trace_id: traceId, span_id: spanId };
  });
}

function isValidSpanId(id: string): boolean {
  return id.length >= 16 && !/^0+$/.test(id);
}

const tracer = trace.getTracer("uigen");

/**
 * Run `fn` inside an active span named `name`. Safe before SDK registration:
 * without a provider, @opentelemetry/api hands out no-op spans and this is
 * effectively a pass-through. Use for operations auto-instrumentation can't
 * see — notably Prisma over the Neon serverless driver (fetch-based, not
 * http/undici-patched).
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) span.setAttributes(attributes);
    try {
      const result = await fn(span);
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
