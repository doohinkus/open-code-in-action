import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  LanguageModelV1,
  LanguageModelV1StreamPart,
  LanguageModelV1Message,
} from "@ai-sdk/provider";
import { createReasoningNormalizingFetch } from "./reasoning-normalizer";
import { DEFAULT_MODEL, resolveFreeModel, ZEN_FREE_MODELS } from "./models";

// Cache for provider instances to avoid recreating them on every request
const providerInstanceCache = new Map<string, LanguageModelV1>();

/**
 * Mock language model for testing and fallback scenarios.
 * Generates canned responses (counter, form, card) based on prompt keywords.
 * When fallbackMessageMode is true, generates an explanatory message instead.
 */
export class MockLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = "v1" as const;
  readonly provider = "mock";
  readonly modelId: string;
  readonly defaultObjectGenerationMode = "tool" as const;
  // When true (used as the last-resort fallback for a failed free-tier turn),
  // the mock explains the limitation instead of emitting a canned component
  // that ignores the user's actual request.
  private readonly fallbackMessageMode: boolean;

  constructor(modelId: string, fallbackMessageMode = false) {
    this.modelId = modelId;
    this.fallbackMessageMode = fallbackMessageMode;
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractUserPrompt(messages: LanguageModelV1Message[]): string {
    // Find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === "user") {
        const content = message.content;
        if (Array.isArray(content)) {
          // Extract text from content parts
          const textParts = content
            .filter((part: any) => part.type === "text")
            .map((part: any) => part.text);
          return textParts.join(" ");
        } else if (typeof content === "string") {
          return content;
        }
      }
    }
    return "";
  }

  private getLastToolResult(messages: LanguageModelV1Message[]): any {
    // Find the last tool message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "tool") {
        const content = messages[i].content;
        if (Array.isArray(content) && content.length > 0) {
          return content[0];
        }
      }
    }
    return null;
  }

  private readonly fallbackMessageText =
    "Unable to complete the component. This application runs on free tier models " +
    "which have computation and usage limitations, and the AI provider was " +
    "rate-limited or timed out. Please try again later or switch to a different free model.";

  private getFallbackMessageCode(): string {
    return `export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-800 mb-3">Unable to complete component</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          This application runs on free tier models which have computation and usage limitations.
          The AI provider was rate-limited or timed out. Please try again later or switch models.
        </p>
      </div>
    </div>
  );
}`;
  }

  private async *generateMockStream(
    messages: LanguageModelV1Message[],
    userPrompt: string
  ): AsyncGenerator<LanguageModelV1StreamPart> {
    // Fallback mode: every real free model failed (rate limit / 504 idle
    // timeout). Show an explanatory message instead of pretending to build the
    // requested component.
    if (this.fallbackMessageMode) {
      const toolMessageCount = messages.filter((m) => m.role === "tool").length;

      if (toolMessageCount === 0) {
        for (const char of this.fallbackMessageText) {
          yield { type: "text-delta", textDelta: char };
          await this.delay(15);
        }

        yield {
          type: "tool-call",
          toolCallType: "function",
          toolCallId: "call_fallback",
          toolName: "str_replace_editor",
          args: JSON.stringify({
            command: "create",
            path: "/App.jsx",
            file_text: this.getFallbackMessageCode(),
          }),
        };

        yield {
          type: "finish",
          finishReason: "tool-calls",
          usage: {
            promptTokens: 50,
            completionTokens: 30,
          },
        };
        return;
      }

      // The /App.jsx message was already created — stop without further edits.
      yield {
        type: "finish",
        finishReason: "stop",
        usage: {
          promptTokens: 50,
          completionTokens: 5,
        },
      };
      return;
    }

    // Count tool messages to determine which step we're on
    const toolMessageCount = messages.filter((m) => m.role === "tool").length;

    // Determine component type from the original user prompt
    const promptLower = userPrompt.toLowerCase();
    let componentType = "counter";
    let componentName = "Counter";

    if (promptLower.includes("form")) {
      componentType = "form";
      componentName = "ContactForm";
    } else if (promptLower.includes("card")) {
      componentType = "card";
      componentName = "Card";
    }

    // Step 1: Create component file
    if (toolMessageCount === 1) {
      const text = `I'll create a ${componentName} component for you.`;
      for (const char of text) {
        yield { type: "text-delta", textDelta: char };
        await this.delay(25);
      }

      yield {
        type: "tool-call",
        toolCallType: "function",
        toolCallId: `call_1`,
        toolName: "str_replace_editor",
        args: JSON.stringify({
          command: "create",
          path: `/components/${componentName}.jsx`,
          file_text: this.getComponentCode(componentType),
        }),
      };

      yield {
        type: "finish",
        finishReason: "tool-calls",
        usage: {
          promptTokens: 50,
          completionTokens: 30,
        },
      };
      return;
    }

    // Step 2: Enhance component
    if (toolMessageCount === 2) {
      const text = `Now let me enhance the component with better styling.`;
      for (const char of text) {
        yield { type: "text-delta", textDelta: char };
        await this.delay(25);
      }

      yield {
        type: "tool-call",
        toolCallType: "function",
        toolCallId: `call_2`,
        toolName: "str_replace_editor",
        args: JSON.stringify({
          command: "str_replace",
          path: `/components/${componentName}.jsx`,
          old_str: this.getOldStringForReplace(componentType),
          new_str: this.getNewStringForReplace(componentType),
        }),
      };

      yield {
        type: "finish",
        finishReason: "tool-calls",
        usage: {
          promptTokens: 50,
          completionTokens: 30,
        },
      };
      return;
    }

    // Step 3: Create App.jsx
    if (toolMessageCount === 0) {
      const text = `This is a static response. Configure an OpenCode Zen endpoint (OPENAI_COMPATIBLE_BASE_URL) in .env to generate with free AI models, or keep mock mode for canned components. Let me create an App.jsx file to display the component.`;
      for (const char of text) {
        yield { type: "text-delta", textDelta: char };
        await this.delay(15);
      }

      yield {
        type: "tool-call",
        toolCallType: "function",
        toolCallId: `call_3`,
        toolName: "str_replace_editor",
        args: JSON.stringify({
          command: "create",
          path: "/App.jsx",
          file_text: this.getAppCode(componentName),
        }),
      };

      yield {
        type: "finish",
        finishReason: "tool-calls",
        usage: {
          promptTokens: 50,
          completionTokens: 30,
        },
      };
      return;
    }

    // Step 4: Final summary (no tool call)
    if (toolMessageCount >= 3) {
      const text = `Perfect! I've created:

1. **${componentName}.jsx** - A fully-featured ${componentType} component
2. **App.jsx** - The main app file that displays the component

The component is now ready to use. You can see the preview on the right side of the screen.`;

      for (const char of text) {
        yield { type: "text-delta", textDelta: char };
        await this.delay(30);
      }

      yield {
        type: "finish",
        finishReason: "stop",
        usage: {
          promptTokens: 50,
          completionTokens: 50,
        },
      };
      return;
    }
  }

  private getComponentCode(componentType: string): string {
    switch (componentType) {
      case "form":
        return `import React, { useState } from 'react';

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    // Handle form submission here
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6">Contact Us</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            required
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors"
        >
          Send Message
        </button>
      </form>
    </div>
  );
};

export default ContactForm;`;

      case "card":
        return `import React from 'react';

const Card = ({ 
  title = "Welcome to Our Service", 
  description = "Discover amazing features and capabilities that will transform your experience.",
  imageUrl,
  actions 
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {imageUrl && (
        <img 
          src={imageUrl} 
          alt={title}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-6">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{description}</p>
        {actions && (
          <div className="mt-4">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default Card;`;

      default:
        return `import { useState } from 'react';

const Counter = () => {
  const [count, setCount] = useState(0);

  const increment = () => {
    setCount(count + 1);
  };

  const decrement = () => {
    setCount(count - 1);
  };

  const reset = () => {
    setCount(0);
  };

  return (
    <div className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Counter</h2>
      <div className="text-4xl font-bold mb-6">{count}</div>
      <div className="flex gap-4">
        <button 
          onClick={decrement}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
        >
          Decrease
        </button>
        <button 
          onClick={reset}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Reset
        </button>
        <button 
          onClick={increment}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          Increase
        </button>
      </div>
    </div>
  );
};

export default Counter;`;
    }
  }

  private getOldStringForReplace(componentType: string): string {
    switch (componentType) {
      case "form":
        return "    console.log('Form submitted:', formData);";
      case "card":
        return '      <div className="p-6">';
      default:
        return "  const increment = () => {\n    setCount(count + 1);\n  };";
    }
  }

  private getNewStringForReplace(componentType: string): string {
    switch (componentType) {
      case "form":
        return "    console.log('Form submitted:', formData);\n    alert('Thank you! We\\'ll get back to you soon.');";
      case "card":
        return '      <div className="p-6 hover:bg-gray-50 transition-colors">';
      default:
        return "  const increment = () => {\n    setCount(prev => prev + 1);\n  };";
    }
  }

  private getAppCode(componentName: string): string {
    if (componentName === "Card") {
      return `import Card from '@/components/Card';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <Card 
          title="Amazing Product"
          description="This is a fantastic product that will change your life. Experience the difference today!"
          actions={
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
              Learn More
            </button>
          }
        />
      </div>
    </div>
  );
}`;
    }

    return `import ${componentName} from '@/components/${componentName}';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <${componentName} />
      </div>
    </div>
  );
}`;
  }

  async doGenerate(
    options: Parameters<LanguageModelV1["doGenerate"]>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
    const userPrompt = this.extractUserPrompt(options.prompt);

    // Collect all stream parts
    const parts: LanguageModelV1StreamPart[] = [];
    for await (const part of this.generateMockStream(
      options.prompt,
      userPrompt
    )) {
      parts.push(part);
    }

    // Build response from parts
    const textParts = parts
      .filter((p) => p.type === "text-delta")
      .map((p) => (p as any).textDelta)
      .join("");

    const toolCalls = parts
      .filter((p) => p.type === "tool-call")
      .map((p) => ({
        toolCallType: "function" as const,
        toolCallId: (p as any).toolCallId,
        toolName: (p as any).toolName,
        args: (p as any).args,
      }));

    // Get finish reason from finish part
    const finishPart = parts.find((p) => p.type === "finish") as any;
    const finishReason = finishPart?.finishReason || "stop";

    return {
      text: textParts,
      toolCalls,
      finishReason: finishReason as any,
      usage: {
        promptTokens: 100,
        completionTokens: 200,
      },
      warnings: [],
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        },
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1["doStream"]>[0]
  ): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
    const userPrompt = this.extractUserPrompt(options.prompt);
    const self = this;

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        try {
          const generator = self.generateMockStream(options.prompt, userPrompt);
          for await (const chunk of generator) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream,
      warnings: [],
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: {},
      },
      rawResponse: { headers: {} },
    };
  }
}

/**
 * Gets the language model for a given model ID.
 * Returns mock provider if forced or if no Zen endpoint is configured.
 *
 * @param modelId - Optional model ID override
 * @returns LanguageModelV1 instance
 */
export function getLanguageModel(modelId?: string): LanguageModelV1 {
  if (process.env.FORCE_MOCK_PROVIDER?.trim() === "1") {
    console.log(
      "FORCE_MOCK_PROVIDER=1 is set. Using the mock provider for deterministic tests."
    );
    return new MockLanguageModel("mock-" + DEFAULT_MODEL);
  }

  const openaiCompatibleBaseURL = process.env.OPENAI_COMPATIBLE_BASE_URL?.trim();

  if (!openaiCompatibleBaseURL) {
    console.log(
      "OPENAI_COMPATIBLE_BASE_URL is not set. Using the mock provider — " +
        "responses will be canned. Set OPENAI_COMPATIBLE_BASE_URL to an " +
        "OpenCode Zen endpoint (free models) to enable real generation."
    );
    return new MockLanguageModel("mock-" + DEFAULT_MODEL);
  }

  const envModel = process.env.OPENAI_COMPATIBLE_MODEL?.trim();
  const fallback = resolveFreeModel(envModel, DEFAULT_MODEL);
  if (envModel && envModel !== fallback) {
    console.log(
      `Model "${envModel}" is not in the free allowlist (ZEN_FREE_MODELS). ` +
        `Falling back to "${fallback}".`
    );
  }
  const requestedModel = resolveFreeModel(modelId, fallback);

  return buildZenModel(requestedModel);
}

function buildZenModel(modelId: string): LanguageModelV1 {
  // Check cache first
  const cached = providerInstanceCache.get(modelId);
  if (cached) {
    return cached;
  }

  const openaiCompatibleBaseURL = process.env.OPENAI_COMPATIBLE_BASE_URL?.trim();
  if (!openaiCompatibleBaseURL) {
    throw new Error("OPENAI_COMPATIBLE_BASE_URL is not set");
  }
  const openaiCompatibleApiKey = process.env.OPENAI_COMPATIBLE_API_KEY?.trim();
  const provider = createOpenAICompatible({
    name: "opencode-compatible",
    baseURL: openaiCompatibleBaseURL,
    ...(openaiCompatibleApiKey ? { apiKey: openaiCompatibleApiKey } : {}),
    fetch: createReasoningNormalizingFetch(),
  });
  const model = provider.chatModel(modelId);

  // Cache the model instance
  providerInstanceCache.set(modelId, model);

  return model;
}

// Provider errors surface in several shapes: APICallError (an Error subclass
// with a statusCode), Error instances, or plain provider objects. The plain
// objects are often `{ error: "..." }` or `{ error: { message/type } }` (e.g.
// Zen's "Streaming response failed: [504] Upstream idle timeout exceeded"),
// so String(error) alone yields "[object Object]" and hides the message.
// Normalize all of these so rate-limit/5xx detection can actually see the text.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message) return record.message;
    const nested = record.error;
    if (typeof nested === "string" && nested) return nested;
    if (nested && typeof nested === "object") {
      const inner = nested as { message?: unknown; type?: unknown };
      if (typeof inner.message === "string" && inner.message) return inner.message;
      if (typeof inner.type === "string" && inner.type) return inner.type;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // fall through to the generic string below
    }
  }
  return String(error ?? "");
}

/**
 * Checks if an error is a rate limit error (429 or rate limit message).
 *
 * @param error - The error to check
 * @returns True if the error indicates a rate limit
 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const record = error as { statusCode?: unknown };
    if (record.statusCode === 429) return true;
  }
  const message = errorMessage(error);
  return /rate limit|rate_limit|429|quota|too many requests|insufficient_quota/i.test(message);
}

// Beyond rate limits, Zen's free endpoints also flake with transient 5xx
// failures (e.g. "Endpoint is unavailable", 503). Treat those as retryable too
// so the chain rotates past a down/temp-unavailable free model instead of
// erroring the turn while other free models still work.
/**
 * Checks if an error is a retryable upstream error (rate limit, 5xx, timeout).
 *
 * @param error - The error to check
 * @returns True if the error is retryable
 */
export function isRetryableUpstreamError(error: unknown): boolean {
  if (isRateLimitError(error)) return true;
  if (error && typeof error === "object") {
    const record = error as { statusCode?: unknown };
    if (typeof record.statusCode === "number" && record.statusCode >= 500) return true;
  }
  const message = errorMessage(error);
  return /unavailable|overloaded|server error|server_error|503|502|504|idle timeout|timed out/i.test(message);
}

/**
 * Wraps a real provider model so a rate-limited or temporarily-unavailable turn
 * transparently rotates through the remaining free models before finally
 * falling back to the canned mock. Other errors propagate immediately.
 *
 * Zen's free tier rate-limits per-model, so trying each free model in turn
 * keeps real generation working even when one model's quota is exhausted.
 *
 * For streaming, rotation only kicks in when a stream errors before a tool
 * call has started (or finishes) — the normal shape of a 429/5xx / Zen's 504
 * idle timeout. Once a tool call is streaming, errors are passed through
 * untouched.
 *
 * streamText calls doStream once per generation step, so the wrapper also
 * remembers which models already failed with a retryable error this turn.
 * Later steps skip the throttled free models and jump straight to a model
 * that can actually respond (e.g. the mock fallback), instead of re-trying
 * rate-limited models every step.
 */
/**
 * Wraps a primary model with fallback models for rate limit/5xx handling.
 * On retryable errors, rotates through the fallback chain.
 * Tracks failed models to skip them on subsequent streamText steps.
 *
 * @param primary - The primary language model
 * @param fallbacks - Array of fallback models to try on failure
 * @returns Wrapped model with automatic failover
 */
export function createRateLimitFallbackModel(
  primary: LanguageModelV1,
  fallbacks: LanguageModelV1[]
): LanguageModelV1 {
  if (primary.provider === "mock") return primary;
  const chain = [primary, ...fallbacks];

  const logRotation = (from: LanguageModelV1, to: LanguageModelV1) => {
    console.log(
      `Model "${from.provider}:${from.modelId}" failed; ` +
        `trying "${to.provider}:${to.modelId}".`
    );
  };

  // Indices of models already rejected with a retryable (rate-limit/5xx/504)
  // error this turn. Scoped to this wrapper instance, so state persists across
  // streamText steps within one request but never bleeds across requests.
  const failedIndices = new Set<number>();

  // The first chain index that hasn't failed yet. Since the mock fallback is
  // last and never fails, this always resolves.
  const firstUsableIndex = (): number => {
    for (let i = 0; i < chain.length; i++) {
      if (!failedIndices.has(i)) return i;
    }
    return chain.length - 1;
  };

  // The next chain index after `after` that hasn't failed yet, or -1.
  const nextUsableIndex = (after: number): number => {
    for (let i = after + 1; i < chain.length; i++) {
      if (!failedIndices.has(i)) return i;
    }
    return -1;
  };

  return {
    specificationVersion: "v1",
    provider: primary.provider,
    modelId: primary.modelId,
    defaultObjectGenerationMode: primary.defaultObjectGenerationMode,
    supportsStructuredOutputs: primary.supportsStructuredOutputs,

    async doGenerate(options) {
      let lastError: unknown = null;
      for (let i = firstUsableIndex(); i < chain.length; i++) {
        if (failedIndices.has(i)) continue;
        try {
          return await chain[i].doGenerate(options);
        } catch (error) {
          if (!isRetryableUpstreamError(error)) throw error;
          failedIndices.add(i);
          lastError = error;
          const next = nextUsableIndex(i);
          if (next !== -1) logRotation(chain[i], chain[next]);
        }
      }
      throw lastError;
    },

    async doStream(options) {
      const startModelStream = async (
        index: number
      ): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> => {
        // A 429 usually surfaces as a rejection of doStream() itself (the HTTP
        // call fails before any chunk is produced). Rotate immediately.
        let result: Awaited<ReturnType<LanguageModelV1["doStream"]>>;
        try {
          result = await chain[index].doStream(options);
        } catch (error) {
          if (isRetryableUpstreamError(error)) {
            failedIndices.add(index);
            const next = nextUsableIndex(index);
            if (next !== -1) {
              logRotation(chain[index], chain[next]);
              return startModelStream(next);
            }
          }
          throw error;
        }

        const reader = result.stream.getReader();

        const stream = new ReadableStream<LanguageModelV1StreamPart>({
          async start(controller) {
            let contentStarted = false;

            const pumpNext = async () => {
              const next = nextUsableIndex(index);
              if (next === -1) {
                controller.error(new Error("All AI provider models failed"));
                return;
              }
              const nextStream = await startModelStream(next);
              const nextReader = nextStream.stream.getReader();
              try {
                for (;;) {
                  const chunk = await nextReader.read();
                  if (chunk.done) break;
                  controller.enqueue(chunk.value);
                }
                controller.close();
              } catch (error) {
                controller.error(error);
              }
            };

            const pump = async (): Promise<void> => {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  return;
                }

                if (value.type === "error") {
                  if (!contentStarted && isRetryableUpstreamError(value.error)) {
                    failedIndices.add(index);
                    if (nextUsableIndex(index) !== -1) {
                      logRotation(chain[index], chain[nextUsableIndex(index)]);
                      return pumpNext();
                    }
                  }
                  controller.enqueue(value);
                  return pump();
                }

                // The stream is only "committed" once a tool call starts
                // streaming (or the stream finishes). Reasoning deltas and
                // plain text are deliberately NOT committed content: a free
                // model that dies mid-generation (e.g. Zen's 504 idle
                // timeout) can still rotate to the next model instead of
                // failing the whole turn. Rotating before any tool call is
                // safe — no tool has executed, so the VFS is untouched.
                if (
                  value.type === "tool-call" ||
                  value.type === "tool-call-delta" ||
                  value.type === "finish"
                ) {
                  contentStarted = true;
                }
                controller.enqueue(value);
                await pump();
              } catch (error) {
                if (!contentStarted && isRetryableUpstreamError(error)) {
                  failedIndices.add(index);
                  if (nextUsableIndex(index) !== -1) {
                    logRotation(chain[index], chain[nextUsableIndex(index)]);
                    return pumpNext();
                  }
                }
                controller.error(error);
              }
            };

            await pump();
          },
        });

        return {
          stream,
          warnings: result.warnings,
          rawCall: result.rawCall,
          rawResponse: result.rawResponse,
        };
      };

      return startModelStream(firstUsableIndex());
    },
  };
}

// The model used by the chat route. Zen's free tier rate-limits per model (and
// free endpoints also flake with 5xx), so the primary free model is backed by
// the remaining free models (ZEN_FREE_MODELS order) with the canned mock as the
// last resort — real generation keeps working unless every free model fails.
/**
 * Builds the language model with fallback chain for the chat route.
 * Creates a wrapped model that rotates through free models on failure,
 * with the mock as the last resort.
 *
 * @param modelId - Optional model ID override
 * @returns LanguageModelV1 with automatic failover
 */
export function buildLanguageModel(modelId?: string): LanguageModelV1 {
  const primary = getLanguageModel(modelId);
  if (primary.provider === "mock") return primary;

  const requested = primary.modelId;
  const otherFreeIds = ZEN_FREE_MODELS.map((m) => m.id).filter((id) => id !== requested);

  const freeChain = otherFreeIds.map((id) => buildZenModel(id));
  // Last resort: explain the free-tier limitation rather than emitting a
  // canned counter that ignores the user's request.
  const mockFallback = new MockLanguageModel("mock-" + DEFAULT_MODEL, true);

  return createRateLimitFallbackModel(primary, [...freeChain, mockFallback]);
}
