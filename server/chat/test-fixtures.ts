import { expect } from "vitest";
import type { ChatErrorBody } from "@/core/chat";
import type { ChatHandlerDeps } from "./handler";
import type { ChatEnv } from "./env";
import type { ChatStreamChunk, ChatStreamer, UpstreamMessage } from "./stream";

// Shared fixtures for the chat handler suites. Fake env, fake clock,
// fake streamer factory, and the request builders. No network.
export const ENV: ChatEnv = {
  upstashUrl: "https://kv.example",
  upstashToken: "kv-token",
  metaKey: "test-owner-meta",
  sessionSecret: "session-secret-for-tests-123",
  ipSalt: "test-salt",
  spendCapMicro: 10_000_000,
  dailySpendCapMicro: 2_000_000,
};

export const DAY = "2026-10-28";
export const NOW = new Date("2026-10-28T12:00:00Z");
export const QUESTION = "Zebra question alpha 42?";
export const LATER_SENTENCE = "There is no place like home.";

export function validBody(over: Record<string, unknown> = {}) {
  return {
    bookId: "oz",
    upToN: 135,
    spoilers: false,
    messages: [{ role: "user", content: QUESTION }],
    ...over,
  };
}

export function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export interface Capture {
  apiKey?: string;
  messages?: UpstreamMessage[];
}

export function factoryFor(
  chunks: ChatStreamChunk[] | Error,
  capture: Capture = {},
  calls: { count: number } = { count: 0 },
): ChatHandlerDeps["createStreamer"] {
  return ({ apiKey }: { apiKey: string; fetchFn: typeof fetch }): ChatStreamer => {
    capture.apiKey = apiKey;
    return {
      stream({ messages }: { messages: UpstreamMessage[] }) {
        calls.count += 1;
        capture.messages = messages;
        return (async function* () {
          if (chunks instanceof Error) throw chunks;
          for (const chunk of chunks) yield chunk;
        })();
      },
    };
  };
}

export const OK_CHUNKS: ChatStreamChunk[] = [
  { type: "delta", text: "Hello " },
  { type: "delta", text: "there" },
  { type: "usage", promptTokens: 100, cachedTokens: 10, completionTokens: 5 },
];

export function anonCookieFrom(res: Response): string {
  const found = res.headers.getSetCookie().find((c) => c.startsWith("img_anon="));
  expect(found).toBeDefined();
  return found!.split(";")[0]!;
}

export async function errBody(res: Response): Promise<ChatErrorBody> {
  return (await res.json()) as ChatErrorBody;
}
