// Meta chat client (OpenAI compatible body, json_schema output).
// Never logs headers or keys; errors carry status plus a short excerpt.
import { fetchWithRetry, retryableError } from "./http";

export interface MetaUsage {
  data: unknown;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
}

export interface MetaClient {
  model: string;
  completeJson(input: {
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
  }): Promise<MetaUsage>;
}

const META_URL = "https://api.meta.ai/v1/chat/completions";

export function createMetaClient(input: { fetchFn?: typeof fetch; apiKey: string; model: string }): MetaClient {
  const fetchFn = input.fetchFn ?? fetch;
  return {
    model: input.model,
    completeJson: async ({ system, user, schemaName, schema }) => {
      const body = JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        reasoning_effort: "low",
        max_tokens: 4000,
        response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
      });
      // fetchWithRetry owns network/429/5xx retries. Small max_tokens
      // can return empty content, so that gets one extra attempt here.
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await fetchWithRetry(
          fetchFn,
          META_URL,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
            body,
          },
          { attempts: 3 },
        );
        const parsed = (await response.json()) as {
          choices?: { message?: { content?: string | null } }[];
          usage?: { prompt_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens?: number };
        };
        const content = parsed.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim().length > 0) {
          try {
            return {
              data: JSON.parse(content) as unknown,
              promptTokens: parsed.usage?.prompt_tokens ?? 0,
              cachedTokens: parsed.usage?.prompt_tokens_details?.cached_tokens ?? 0,
              completionTokens: parsed.usage?.completion_tokens ?? 0,
            };
          } catch {
            lastError = retryableError("Meta returned unparseable JSON content");
          }
        } else {
          lastError = retryableError("Meta returned empty content");
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}
