import "server-only";
import { CHAT_MAX_TOKENS, CHAT_MODEL } from "@/core/chat";

export interface UpstreamMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const META_CHAT_URL = "https://api.meta.ai/v1/chat/completions";
const FIRST_TOKEN_TIMEOUT_MS = 20_000;
// Under the 60 s route budget, so the error event still goes out before
// the function kill.
const TOTAL_TIMEOUT_MS = 55_000;

export type ChatStreamChunk =
  | { type: "delta"; text: string }
  | { type: "usage"; promptTokens: number; cachedTokens: number; completionTokens: number };

export interface ChatStreamer {
  stream(args: { messages: UpstreamMessage[]; signal?: AbortSignal }): AsyncIterable<ChatStreamChunk>;
}

// Meta streaming client. Errors carry only the status number or a timeout
// word: never the key, the prompt, or upstream response text.
export function createChatStreamer(args: {
  apiKey: string;
  fetchFn?: typeof fetch;
  firstTokenTimeoutMs?: number;
  totalTimeoutMs?: number;
}): ChatStreamer {
  const fetchFn = args.fetchFn ?? fetch;
  const firstMs = args.firstTokenTimeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
  const totalMs = args.totalTimeoutMs ?? TOTAL_TIMEOUT_MS;

  return {
    stream({ messages, signal }: { messages: UpstreamMessage[]; signal?: AbortSignal }) {
      return (async function* (): AsyncGenerator<ChatStreamChunk> {
        const ctrl = new AbortController();
        let timedOut: "first-token" | "total" | null = null;
        const onCallerAbort = (): void => ctrl.abort();
        if (signal?.aborted) ctrl.abort();
        else signal?.addEventListener("abort", onCallerAbort, { once: true });
        const firstTimer = setTimeout(() => {
          timedOut = "first-token";
          ctrl.abort();
        }, firstMs);
        const totalTimer = setTimeout(() => {
          timedOut = "total";
          ctrl.abort();
        }, totalMs);
        let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
        const cancelOnAbort = (): void => {
          reader?.cancel().catch(() => {});
        };
        ctrl.signal.addEventListener("abort", cancelOnAbort);
        const fail = (cause: unknown): Error => {
          if (signal?.aborted && !timedOut) {
            return cause instanceof Error ? cause : new Error("chat upstream aborted");
          }
          if (timedOut) return new Error(`chat upstream ${timedOut} timeout`);
          return new Error("chat upstream failed");
        };
        try {
          let res: Response;
          try {
            res = await fetchFn(META_CHAT_URL, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${args.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: CHAT_MODEL,
                messages,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: CHAT_MAX_TOKENS,
                reasoning_effort: "low",
              }),
              signal: ctrl.signal,
            });
          } catch (cause) {
            throw fail(cause);
          }
          if (!res.ok || !res.body) throw new Error(`chat upstream ${res.status}`);
          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let firstDelta = false;
          for (;;) {
            let read: ReadableStreamReadResult<Uint8Array>;
            try {
              read = await reader.read();
            } catch (cause) {
              throw fail(cause);
            }
            if (read.done) break;
            buf += decoder.decode(read.value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const chunk of parseSseLines(lines)) yield* emitChunk(chunk, () => {
              if (!firstDelta) {
                firstDelta = true;
                clearTimeout(firstTimer);
              }
            });
          }
          if (timedOut) throw new Error(`chat upstream ${timedOut} timeout`);
          buf += decoder.decode();
          for (const chunk of parseSseLines(buf.split("\n"))) {
            yield* emitChunk(chunk, () => {
              if (!firstDelta) {
                firstDelta = true;
                clearTimeout(firstTimer);
              }
            });
          }
        } finally {
          // Also runs when the consumer stops early (client cancel): drop the upstream call.
          ctrl.abort();
          clearTimeout(firstTimer);
          clearTimeout(totalTimer);
          signal?.removeEventListener("abort", onCallerAbort);
          ctrl.signal.removeEventListener("abort", cancelOnAbort);
          try {
            reader?.releaseLock();
          } catch {
            // Already cancelled or never opened.
          }
        }
      })();
    },
  };
}

function* emitChunk(
  chunk: ChatStreamChunk | null,
  onFirstDelta: () => void,
): Generator<ChatStreamChunk> {
  if (!chunk) return;
  if (chunk.type === "delta") onFirstDelta();
  yield chunk;
}

// OpenAI-style SSE: lines of `data: {...}` and a final `data: [DONE]`.
// Only delta content text and the usage block are read; reasoning fields
// and empty text are skipped.
function parseSseLines(lines: string[]): (ChatStreamChunk | null)[] {
  const out: (ChatStreamChunk | null)[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).replace(/^ /, "");
    if (payload === "[DONE]") continue;
    let json: {
      choices?: { delta?: { content?: unknown } }[];
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } };
    };
    try {
      json = JSON.parse(payload) as typeof json;
    } catch {
      continue;
    }
    if (json === null || typeof json !== "object") {
      out.push(null);
      continue;
    }
    const delta = json.choices?.[0]?.delta;
    const content = delta && typeof delta === "object" ? delta.content : undefined;
    if (typeof content === "string" && content.length > 0) {
      out.push({ type: "delta", text: content });
      continue;
    }
    const usage = json.usage;
    if (
      usage !== null &&
      typeof usage === "object" &&
      typeof usage.prompt_tokens === "number" &&
      typeof usage.completion_tokens === "number"
    ) {
      const cached = usage.prompt_tokens_details;
      out.push({
        type: "usage",
        promptTokens: usage.prompt_tokens,
        cachedTokens:
          cached !== null && typeof cached === "object" && typeof cached.cached_tokens === "number"
            ? cached.cached_tokens
            : 0,
        completionTokens: usage.completion_tokens,
      });
      continue;
    }
    out.push(null);
  }
  return out;
}
