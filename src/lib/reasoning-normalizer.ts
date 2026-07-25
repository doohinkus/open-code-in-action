/**
 * Custom fetch wrapper that normalizes reasoning field names.
 *
 * Some OpenAI-compatible providers (e.g. OpenCode Zen / big-pickle) return
 * `reasoning` in their responses, but the `@ai-sdk/openai-compatible` SDK
 * only looks for `reasoning_content`. This wrapper renames the field so the
 * SDK can pick up reasoning/thinking tokens.
 *
 * For streaming, we use a simple regex replace on the raw text instead of
 * JSON parsing, because network chunks don't align with SSE line boundaries.
 * The regex matches `"reasoning":` (the JSON key) but NOT `"reasoning_details":`
 * or `"reasoning_tokens":` because those have additional characters before `:`.
 */
const RENAME_REASONING_RE = /"reasoning":/g;

export function createReasoningNormalizingFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await globalThis.fetch(input, init);

    const contentType = response.headers.get("content-type") || "";

    // Streaming SSE responses — regex replace on raw text (no JSON parsing)
    if (contentType.includes("text/event-stream") && response.body) {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const transformer = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true });
          const normalized = text.replace(RENAME_REASONING_RE, '"reasoning_content":');
          controller.enqueue(encoder.encode(normalized));
        },
      });

      const transformedBody = response.body.pipeThrough(transformer);
      return new Response(transformedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    // Non-streaming JSON responses
    const cloned = response.clone();
    try {
      const json = await cloned.json();
      if (json.choices) {
        for (const choice of json.choices) {
          const msg = choice.message;
          if (msg?.reasoning !== undefined && msg.reasoning_content === undefined) {
            msg.reasoning_content = msg.reasoning;
            delete msg.reasoning;
          }
        }
      }
      return new Response(JSON.stringify(json), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch {
      return response;
    }
  };
}
