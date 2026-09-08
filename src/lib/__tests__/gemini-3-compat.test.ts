import { describe, test, expect, vi, afterEach } from "vitest";
import { createGemini3CompatFetch } from "@/lib/gemini-3-compat";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(impl: typeof fetch) {
  const mocked = vi.fn(impl);
  globalThis.fetch = mocked as unknown as typeof fetch;
  return mocked;
}

function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function postInit(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

async function drain(response: Response): Promise<string> {
  return await response.text();
}

describe("createGemini3CompatFetch", () => {
  test("injects low thinkingLevel with thought summaries into Gemini 3.x stream requests", async () => {
    const mocked = stubFetch(async () => sseResponse([{}]));
    const f = createGemini3CompatFetch();

    const res = await f(
      `${BASE}/gemini-3.6-flash:streamGenerateContent?alt=sse`,
      postInit({ generationConfig: { maxOutputTokens: 100 } })
    );
    await drain(res);

    const init = mocked.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "low",
      includeThoughts: true,
    });
    expect(body.generationConfig.maxOutputTokens).toBe(100);
  });

  test("replaces any thinkingBudget on 3.x requests", async () => {
    const mocked = stubFetch(async () => sseResponse([{}]));
    const f = createGemini3CompatFetch();

    await f(
      `${BASE}/gemini-3.5-flash:generateContent`,
      postInit({ generationConfig: { thinkingConfig: { thinkingBudget: 0 } } })
    );

    const init = mocked.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "low",
      includeThoughts: true,
    });
  });

  test("leaves Gemini 2.5 requests untouched", async () => {
    const mocked = stubFetch(async () => new Response("{}"));
    const f = createGemini3CompatFetch();
    const body = { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } };

    await f(`${BASE}/gemini-2.5-flash:streamGenerateContent?alt=sse`, postInit(body));

    const init = mocked.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  test("passes through non-stream 3.x generateContent without harvesting", async () => {
    const mocked = stubFetch(async () => new Response("{}"));
    const f = createGemini3CompatFetch();

    await f(`${BASE}/gemini-3.6-flash:generateContent`, postInit({ contents: [] }));

    expect(mocked).toHaveBeenCalledTimes(1);
  });

  test("injects harvested signatures into outgoing bare functionCall parts", async () => {
    const signature = "sig-abc-123";
    const f = createGemini3CompatFetch();

    // Step 1: a 3.x stream that returns a functionCall carrying a signature.
    const mocked1 = stubFetch(async () =>
      sseResponse([
        {
          candidates: [
            {
              content: {
                parts: [
                  { text: "", thoughtSignature: "thinking-sig" },
                  { functionCall: { name: "str_replace_editor", args: {} }, thoughtSignature: signature },
                ],
              },
            },
          ],
        },
      ])
    );
    const first = await f(`${BASE}/gemini-3.6-flash:streamGenerateContent?alt=sse`, postInit({ contents: [] }));
    await drain(first); // let the harvester consume the stream
    await new Promise((r) => setTimeout(r, 20));
    expect(mocked1).toHaveBeenCalledTimes(1);

    // Step 2: a follow-up request whose history has a bare functionCall.
    const mocked2 = stubFetch(async () => new Response("{}"));
    await f(
      `${BASE}/gemini-3.6-flash:streamGenerateContent?alt=sse`,
      postInit({
        contents: [
          { role: "user", parts: [{ text: "go" }] },
          { role: "model", parts: [{ functionCall: { name: "str_replace_editor", args: {} } }] },
          { role: "user", parts: [{ functionResponse: { name: "str_replace_editor" } }] },
        ],
      })
    );

    const init = mocked2.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    const modelPart = body.contents[1].parts[0];
    expect(modelPart.thoughtSignature).toBe(signature);
    // Non-functionCall parts and parts already carrying a signature stay alone.
    expect(body.contents[0].parts[0].thoughtSignature).toBeUndefined();
  });

  test("falls back to the latest thinking-block signature for bare calls", async () => {
    const f = createGemini3CompatFetch();

    const mocked1 = stubFetch(async () =>
      sseResponse([
        {
          candidates: [{ content: { parts: [{ text: "", thoughtSignature: "block-sig" }] } }],
        },
      ])
    );
    const first = await f(`${BASE}/gemini-3.6-flash:streamGenerateContent?alt=sse`, postInit({ contents: [] }));
    await drain(first);
    await new Promise((r) => setTimeout(r, 20));
    expect(mocked1).toHaveBeenCalledTimes(1);

    const mocked2 = stubFetch(async () => new Response("{}"));
    await f(
      `${BASE}/gemini-3.6-flash:streamGenerateContent?alt=sse`,
      postInit({
        contents: [{ role: "model", parts: [{ functionCall: { name: "file_manager", args: {} } }] }],
      })
    );

    const init = mocked2.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].thoughtSignature).toBe("block-sig");
  });

  test("never breaks the caller's stream when harvesting fails", async () => {
    const broken = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("boom"));
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } }
    );
    stubFetch(async () => broken);
    const f = createGemini3CompatFetch();

    const res = await f(`${BASE}/gemini-3.6-flash:streamGenerateContent?alt=sse`, postInit({ contents: [] }));
    await expect(drain(res)).rejects.toThrow("boom");
  });
});
