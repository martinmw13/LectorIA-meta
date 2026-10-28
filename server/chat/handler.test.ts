import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYOK_HEADER,
  CHAT_MESSAGES,
  chatQuotaKeys,
} from "@/core/chat";
import type { ChatErrorBody } from "@/core/chat";
import { createMemoryKV } from "@/core/images";
import { spendKey, dailySpendKey } from "@/core/images";
import { hashIp } from "@/server/images/quota";
import { handleChatPost } from "./handler";
import type { ChatHandlerDeps } from "./handler";
import type { ChatEnv } from "./env";
import { resetTurnstileWarnForTests } from "./turnstile";
import type { ChatStreamChunk, ChatStreamer, UpstreamMessage } from "./stream";

const ENV: ChatEnv = {
  upstashUrl: "https://kv.example",
  upstashToken: "kv-token",
  metaKey: "test-owner-meta",
  sessionSecret: "session-secret-for-tests-123",
  ipSalt: "test-salt",
  spendCapMicro: 10_000_000,
  dailySpendCapMicro: 2_000_000,
};

const DAY = "2026-10-28";
const NOW = new Date("2026-10-28T12:00:00Z");
const QUESTION = "Zebra question alpha 42?";
const LATER_SENTENCE = "There is no place like home.";

function validBody(over: Record<string, unknown> = {}) {
  return {
    bookId: "oz",
    upToN: 135,
    spoilers: false,
    messages: [{ role: "user", content: QUESTION }],
    ...over,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface Capture {
  apiKey?: string;
  messages?: UpstreamMessage[];
}

function factoryFor(
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

const OK_CHUNKS: ChatStreamChunk[] = [
  { type: "delta", text: "Hello " },
  { type: "delta", text: "there" },
  { type: "usage", promptTokens: 100, cachedTokens: 10, completionTokens: 5 },
];

function anonCookieFrom(res: Response): string {
  const found = res.headers.getSetCookie().find((c) => c.startsWith("img_anon="));
  expect(found).toBeDefined();
  return found!.split(";")[0]!;
}

async function errBody(res: Response): Promise<ChatErrorBody> {
  return (await res.json()) as ChatErrorBody;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetTurnstileWarnForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleChatPost", () => {
  it("rejects an oversize body with 413", async () => {
    const res = await handleChatPost(post("x".repeat(16_384 + 1)), { env: ENV });
    expect(res.status).toBe(413);
    expect((await errBody(res)).code).toBe("too_large");
  });

  it("rejects bad JSON and bad shapes with 400", async () => {
    const kv = createMemoryKV();
    const badJson = await handleChatPost(post("{nope"), { env: ENV, kv });
    expect(badJson.status).toBe(400);
    expect((await errBody(badJson)).code).toBe("bad_request");

    const badShape = await handleChatPost(
      post(validBody({ messages: [{ role: "assistant", content: "hi" }] })),
      { env: ENV, kv },
    );
    expect(badShape.status).toBe(400);
    expect((await errBody(badShape)).code).toBe("bad_request");
  });

  it("rejects a short BYOK key with 400", async () => {
    const res = await handleChatPost(post(validBody(), { [BYOK_HEADER]: "abc" }), {
      env: ENV,
      kv: createMemoryKV(),
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(res.status).toBe(400);
    expect((await errBody(res)).code).toBe("bad_request");
  });

  it("returns 503 when env is missing", async () => {
    const saved = { ...process.env };
    for (const k of [
      "UPSTASH_REDIS_REST_URL",
      "KV_REST_API_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "KV_REST_API_TOKEN",
      "META_API_KEY",
      "SESSION_SECRET",
      "IP_HASH_SALT",
    ]) {
      delete process.env[k];
    }
    try {
      const res = await handleChatPost(post(validBody()));
      expect(res.status).toBe(503);
      expect((await errBody(res)).code).toBe("unavailable");
    } finally {
      process.env = saved;
    }
  });

  it("streams deltas then done with remaining 14 and sets the anon cookie", async () => {
    const kv = createMemoryKV();
    const capture: Capture = {};
    const res = await handleChatPost(post(validBody()), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS, capture),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain('event: delta\ndata: {"text":"Hello "}');
    expect(text).toContain('event: delta\ndata: {"text":"there"}');
    expect(text).toContain('event: done\ndata: {"remaining":14}');
    expect(capture.apiKey).toBe(ENV.metaKey);
    anonCookieFrom(res);
  });

  it("scopes the system message to upToN without spoilers and widens it with spoilers", async () => {
    for (const spoilers of [false, true]) {
      const kv = createMemoryKV();
      const capture: Capture = {};
      const res = await handleChatPost(post(validBody({ spoilers })), {
        env: ENV,
        kv,
        now: NOW,
        createStreamer: factoryFor(OK_CHUNKS, capture),
      });
      expect(res.status).toBe(200);
      await res.text();
      const system = capture.messages?.[0]?.content ?? "";
      expect(capture.messages?.[0]?.role).toBe("system");
      expect(system).toContain("cyclone cellar");
      if (spoilers) expect(system).toContain(LATER_SENTENCE);
      else expect(system).not.toContain(LATER_SENTENCE);
    }
  });

  it("refunds quota and spend when upstream fails before the first token", async () => {
    const kv = createMemoryKV();
    const res = await handleChatPost(post(validBody()), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(new Error("upstream secret xyz")),
    });
    expect(res.status).toBe(503);
    const raw = await res.text();
    const body = JSON.parse(raw) as ChatErrorBody;
    expect(body.code).toBe("unavailable");
    expect(body.message).toBe(CHAT_MESSAGES.unavailable);
    expect(raw).not.toContain("upstream secret xyz");
    const keys = chatQuotaKeys({ day: DAY, ipHash: hashIp("unknown", ENV.ipSalt), anonId: "x", byok: false });
    expect(keys.ip).toContain("chat:quota:");
    expect(Number(await kv.get(spendKey()))).toBe(0);
    expect(Number(await kv.get(dailySpendKey(DAY)))).toBe(0);
  });

  it("sends an error event when upstream fails mid-stream", async () => {
    const kv = createMemoryKV();
    const res = await handleChatPost(post(validBody()), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: () => ({
        stream() {
          return (async function* (): AsyncGenerator<ChatStreamChunk> {
            yield { type: "delta", text: "part" };
            throw new Error("midstream boom secret");
          })();
        },
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: delta\ndata: {"text":"part"}');
    expect(text).toContain(`event: error\ndata: {"code":"unavailable","message":"${CHAT_MESSAGES.unavailable}"}`);
    expect(text).not.toContain("midstream boom");
    expect(text).not.toContain("event: done");
  });

  it("limits each person to 15 questions a day", async () => {
    const kv = createMemoryKV();
    const deps = {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS),
    };
    let cookie = "";
    for (let i = 0; i < 15; i += 1) {
      const res = await handleChatPost(post(validBody(), cookie ? { Cookie: cookie } : {}), deps);
      expect(res.status).toBe(200);
      if (!cookie) cookie = anonCookieFrom(res);
      const done = (await res.text()).split("\n").find((l) => l.startsWith("data: {\"remaining\""));
      if (i === 0) expect(done).toBe('data: {"remaining":14}');
    }
    const over = await handleChatPost(post(validBody(), { Cookie: cookie }), deps);
    expect(over.status).toBe(429);
    expect((await errBody(over)).code).toBe("quota");
  });

  it("uses the BYOK key for upstream, skips spend caps and omits remaining", async () => {
    const kv = createMemoryKV();
    const capture: Capture = {};
    const res = await handleChatPost(post(validBody(), { [BYOK_HEADER]: "  byok-key-123  " }), {
      env: { ...ENV, spendCapMicro: 0, dailySpendCapMicro: 0 },
      kv,
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS, capture),
    });
    expect(res.status).toBe(200);
    expect(capture.apiKey).toBe("byok-key-123");
    const text = await res.text();
    expect(text).toContain("event: done\ndata: {}");
    expect(text).not.toContain("remaining");
    expect(await kv.get(spendKey())).toBeNull();
    expect(await kv.get(dailySpendKey(DAY))).toBeNull();
  });

  it("returns byok_required with refunds when the global cap is hit", async () => {
    for (const cap of [{ spendCapMicro: 0 }, { dailySpendCapMicro: 0 }]) {
      const kv = createMemoryKV();
      const res = await handleChatPost(post(validBody()), {
        env: { ...ENV, ...cap },
        kv,
        now: NOW,
        createStreamer: factoryFor(OK_CHUNKS),
      });
      expect(res.status).toBe(503);
      expect((await errBody(res)).code).toBe("byok_required");
      expect(Number(await kv.get(spendKey()))).toBe(0);
      expect(Number(await kv.get(dailySpendKey(DAY)))).toBe(0);
    }
  });

  it("requires Turnstile when configured, then honors the human cookie", async () => {
    const kv = createMemoryKV();
    const turnEnv: ChatEnv = { ...ENV, turnstileSecret: "ts-secret" };
    const siteFetch = vi.fn(async () => Response.json({ success: true }));

    const blocked = await handleChatPost(post(validBody()), {
      env: turnEnv,
      kv,
      now: NOW,
      fetchFn: siteFetch as unknown as typeof fetch,
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(blocked.status).toBe(403);
    expect((await errBody(blocked)).code).toBe("human");
    expect(siteFetch).not.toHaveBeenCalled();

    const passed = await handleChatPost(post(validBody({ turnstileToken: "tok" })), {
      env: turnEnv,
      kv,
      now: NOW,
      fetchFn: siteFetch as unknown as typeof fetch,
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(passed.status).toBe(200);
    expect(siteFetch).toHaveBeenCalledOnce();
    await passed.text();
    const human = passed.headers
      .getSetCookie()
      .find((c) => c.startsWith("chat_human="))
      ?.split(";")[0];
    expect(human).toBeDefined();

    const cookie = `${anonCookieFrom(passed)}; ${human}`;
    const again = await handleChatPost(post(validBody()), {
      env: turnEnv,
      kv,
      now: NOW,
      fetchFn: siteFetch as unknown as typeof fetch,
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(again.status).toBe(403);

    const withCookies = await handleChatPost(
      post(validBody(), { Cookie: cookie }),
      {
        env: turnEnv,
        kv,
        now: NOW,
        fetchFn: siteFetch as unknown as typeof fetch,
        createStreamer: factoryFor(OK_CHUNKS),
      },
    );
    expect(withCookies.status).toBe(200);
    expect(siteFetch).toHaveBeenCalledOnce();
  });

  it("never leaks the key, upstream text, or question in responses or logs", async () => {
    const kv = createMemoryKV();
    const deps: ChatHandlerDeps = {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(new Error("upstream leak WORD")),
    };
    const failed = await handleChatPost(post(validBody()), deps);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("WORD");

    const midDeps: ChatHandlerDeps = {
      env: ENV,
      kv: createMemoryKV(),
      now: NOW,
      createStreamer: () => ({
        stream() {
          return (async function* (): AsyncGenerator<ChatStreamChunk> {
            yield { type: "delta", text: "ok" };
            throw new Error("midstream leak WORD");
          })();
        },
      }),
    };
    const mid = await handleChatPost(post(validBody()), midDeps);
    expect(await mid.text()).not.toContain("WORD");

    for (const spy of [errorSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          const text = String(arg);
          expect(text).not.toContain(QUESTION);
          expect(text).not.toContain(ENV.metaKey);
          expect(text).not.toContain("WORD");
        }
      }
    }
  });
});
