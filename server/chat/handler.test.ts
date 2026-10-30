import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BYOK_HEADER,
  CHAT_MESSAGES,
  chatQuotaKeys,
} from "@/core/chat";
import type { ChatErrorBody } from "@/core/chat";
import { createMemoryKV } from "@/core/images";
import { dailySpendKey, spendKey } from "@/server/guard/spend";
import { issueAnonId } from "@/server/guard/anon";
import { hashIp, ipBucket } from "@/server/guard/request";
import { handleChatPost } from "./handler";
import type { ChatHandlerDeps } from "./handler";
import type { ChatEnv } from "./env";
import { resetTurnstileWarnForTests } from "@/server/guard/human";
import type { ChatStreamChunk } from "./stream";
import {
  DAY,
  ENV,
  LATER_SENTENCE,
  NOW,
  OK_CHUNKS,
  QUESTION,
  anonCookieFrom,
  errBody,
  factoryFor,
  post,
  validBody,
} from "./test-fixtures";
import type { Capture } from "./test-fixtures";

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

  it("warns on expected failures and errors only on upstream crashes", async () => {
    const kv = createMemoryKV();
    const bad = await handleChatPost(post("{"), { env: ENV, kv });
    expect(bad.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("chat bad_request"));
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockClear();
    errorSpy.mockClear();
    const failed = await handleChatPost(post(validBody()), {
      env: ENV,
      kv: createMemoryKV(),
      now: NOW,
      createStreamer: factoryFor(new Error("upstream boom")),
    });
    expect(failed.status).toBe(503);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("chat unavailable"));
    for (const call of warnSpy.mock.calls) {
      expect(String(call[0])).not.toContain("chat unavailable");
    }
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

  it("refunds quota and spend when createStreamer throws", async () => {
    const kv = createMemoryKV();
    const issued = issueAnonId(ENV.sessionSecret);
    const keys = chatQuotaKeys({
      day: DAY,
      ipHash: hashIp(ipBucket("unknown", issued.id), ENV.ipSalt),
      anonId: issued.id,
      byok: false,
    });
    const res = await handleChatPost(post(validBody(), { Cookie: `img_anon=${issued.value}` }), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: () => {
        throw new Error("create boom secret xyz");
      },
    });
    expect(res.status).toBe(503);
    const raw = await res.text();
    const body = JSON.parse(raw) as ChatErrorBody;
    expect(body.code).toBe("unavailable");
    expect(body.message).toBe(CHAT_MESSAGES.unavailable);
    expect(raw).not.toContain("create boom secret xyz");
    expect(Number(await kv.get(keys.ip))).toBe(0);
    expect(Number(await kv.get(keys.anon))).toBe(0);
    expect(Number(await kv.get(spendKey()))).toBe(0);
    expect(Number(await kv.get(dailySpendKey(DAY)))).toBe(0);
  });

  it("refunds quota and spend when streamer.stream throws before the first chunk", async () => {
    const kv = createMemoryKV();
    const issued = issueAnonId(ENV.sessionSecret);
    const keys = chatQuotaKeys({
      day: DAY,
      ipHash: hashIp(ipBucket("unknown", issued.id), ENV.ipSalt),
      anonId: issued.id,
      byok: false,
    });
    const res = await handleChatPost(post(validBody(), { Cookie: `img_anon=${issued.value}` }), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: () => ({
        stream() {
          throw new Error("stream boom secret xyz");
        },
      }),
    });
    expect(res.status).toBe(503);
    const raw = await res.text();
    const body = JSON.parse(raw) as ChatErrorBody;
    expect(body.code).toBe("unavailable");
    expect(body.message).toBe(CHAT_MESSAGES.unavailable);
    expect(raw).not.toContain("stream boom secret xyz");
    expect(Number(await kv.get(keys.ip))).toBe(0);
    expect(Number(await kv.get(keys.anon))).toBe(0);
    expect(Number(await kv.get(spendKey()))).toBe(0);
    expect(Number(await kv.get(dailySpendKey(DAY)))).toBe(0);
  });

  it("keeps the spend reserve when the stream ends without usage", async () => {
    const kv = createMemoryKV();
    const res = await handleChatPost(post(validBody()), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor([{ type: "delta", text: "Hello" }]),
    });
    expect(res.status).toBe(200);
    await res.text();
    expect(Number(await kv.get(spendKey()))).toBeGreaterThan(0);
    expect(Number(await kv.get(dailySpendKey(DAY)))).toBe(Number(await kv.get(spendKey())));
  });

  it("gives back the spend reserve when Redis fails between reserves", async () => {
    const kv = createMemoryKV();
    const realIncrBy = kv.incrBy.bind(kv);
    kv.incrBy = async (key: string, by: number) => {
      if (key === dailySpendKey(DAY)) throw new Error("redis down");
      return realIncrBy(key, by);
    };
    const res = await handleChatPost(post(validBody()), {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS),
    });
    expect(res.status).toBe(503);
    expect((await errBody(res)).code).toBe("unavailable");
    expect(Number(await kv.get(spendKey()))).toBe(0);
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
    const turnEnv: ChatEnv = { ...ENV, turnstileSecret: "ts-secret", turnstileSiteKey: "ts-site" };
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
    const setCookies = passed.headers.getSetCookie();
    const human = setCookies.find((c) => c.startsWith("human_ok="))?.split(";")[0];
    expect(human).toBeDefined();
    expect(setCookies.find((c) => c.startsWith("human_ok="))).toContain("Path=/api");

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

  it("accepts an outstanding legacy chat_human cookie without siteverify", async () => {
    const kv = createMemoryKV();
    const turnEnv: ChatEnv = { ...ENV, turnstileSecret: "ts-secret", turnstileSiteKey: "ts-site" };
    const siteFetch = vi.fn(async () => Response.json({ success: true }));
    const { createHmac } = await import("node:crypto");
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const sig = createHmac("sha256", ENV.sessionSecret).update(`chat_human:${expiry}`).digest("hex");
    const res = await handleChatPost(
      post(validBody(), { Cookie: `chat_human=${expiry}.${sig}` }),
      {
        env: turnEnv,
        kv,
        now: NOW,
        fetchFn: siteFetch as unknown as typeof fetch,
        createStreamer: factoryFor(OK_CHUNKS),
      },
    );
    expect(res.status).toBe(200);
    expect(siteFetch).not.toHaveBeenCalled();
  });

  it("rejects a text/plain cross-site POST with 400 without calling upstream", async () => {
    const kv = createMemoryKV();
    const capture: Capture = {};
    const calls = { count: 0 };
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Origin: "https://evil.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify(validBody()),
    });
    const res = await handleChatPost(req, {
      env: ENV,
      kv,
      now: NOW,
      createStreamer: factoryFor(OK_CHUNKS, capture, calls),
    });
    expect(res.status).toBe(400);
    expect((await errBody(res)).code).toBe("bad_request");
    expect(calls.count).toBe(0);
    expect(capture.messages).toBeUndefined();
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
