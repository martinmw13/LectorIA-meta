import "server-only";
import {
  BYOK_HEADER,
  CHAT_BYOK_DAILY_LIMIT,
  CHAT_DAILY_LIMIT,
  CHAT_MAX_ANSWER_CHARS,
  CHAT_MAX_BODY_BYTES,
  CHAT_MESSAGES,
  HTTP_STATUS,
  bookTextUpTo,
  buildChatSystemPrompt,
  chatQuotaKeys,
  encodeSse,
  estimateCostMicro,
  parseChatRequest,
  usageCostMicro,
} from "@/core/chat";
import type { ChatErrorBody, ChatErrorCode, ChatRequest } from "@/core/chat";
import { DAILY_SPEND_TTL_SEC, budgetExceeded, dailySpendKey, spendKey } from "@/core/images";
import type { KV } from "@/core/images";
import { loadOzBook } from "@/server/books";
import { readBodyCapped } from "@/server/images/body";
import {
  issueAnonId,
  parseAnonCookie,
  serializeAnonCookie,
  verifyAnonCookie,
} from "@/server/images/cookies";
import { createRestKV } from "@/server/images/kv";
import { clientIp, hashIp, utcDay } from "@/server/images/quota";
import { readChatEnv } from "./env";
import type { ChatEnv } from "./env";
import { refundChatQuota, takeChatQuota } from "./quota";
import { createChatStreamer } from "./stream";
import type { ChatStreamChunk, ChatStreamer, UpstreamMessage } from "./stream";
import {
  issueHumanCookie,
  parseHumanCookie,
  verifyHumanCookie,
  verifyTurnstile,
  warnTurnstileSkippedOnce,
} from "./turnstile";

export interface ChatHandlerDeps {
  env?: ChatEnv;
  kv?: KV;
  createStreamer?: (args: { apiKey: string; fetchFn: typeof fetch }) => ChatStreamer;
  fetchFn?: typeof fetch;
  now?: Date;
}

function fail(code: ChatErrorCode, ch: number | "?", cookies: string[]): Response {
  console.error(`chat ${code} book=oz ch=${ch}`);
  const headers = new Headers();
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json(
    { status: "error", code, message: CHAT_MESSAGES[code] } satisfies ChatErrorBody,
    { status: HTTP_STATUS[code], headers },
  );
}

function isAsciiPrintable(text: string): boolean {
  return /^[\x20-\x7E]+$/.test(text);
}

// Order: body cap and shape, env, Turnstile, anonymous cookie, per-person
// quota, global caps, upstream. A question that produced no token refunds
// its quota and spend reserves; mid-stream failures do not.
export async function handleChatPost(req: Request, deps: ChatHandlerDeps = {}): Promise<Response> {
  const cookies: string[] = [];

  const capped = await readBodyCapped(req, CHAT_MAX_BODY_BYTES);
  if (!capped.ok) return fail(capped.reason === "too_large" ? "too_large" : "bad_request", "?", cookies);

  let body: ChatRequest;
  try {
    body = parseChatRequest(JSON.parse(capped.text));
  } catch {
    return fail("bad_request", "?", cookies);
  }

  let env = deps.env;
  if (!env) {
    try {
      env = readChatEnv();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const prefix = "missing chat env:";
      console.warn(`chat env missing: ${message.startsWith(prefix) ? message.slice(prefix.length).trim() : ""}`);
      return fail("unavailable", "?", cookies);
    }
  }

  const fetchFn = deps.fetchFn ?? fetch;
  if (env.turnstileSecret) {
    if (!verifyHumanCookie(parseHumanCookie(req.headers.get("cookie")), env.sessionSecret)) {
      const ok = body.turnstileToken
        ? await verifyTurnstile(
            body.turnstileToken,
            clientIp(req.headers.get("x-forwarded-for")),
            env.turnstileSecret,
            fetchFn,
          )
        : false;
      if (!ok) return fail("human", "?", cookies);
      cookies.push(issueHumanCookie(env.sessionSecret));
    }
  } else {
    warnTurnstileSkippedOnce();
  }

  let anonId = verifyAnonCookie(parseAnonCookie(req.headers.get("cookie")), env.sessionSecret);
  if (!anonId) {
    const issued = issueAnonId(env.sessionSecret);
    anonId = issued.id;
    cookies.push(serializeAnonCookie(issued.value));
  }

  const rawByok = req.headers.get(BYOK_HEADER);
  let byokKey: string | null = null;
  if (rawByok !== null) {
    const trimmed = rawByok.trim();
    if (trimmed.length < 8 || trimmed.length > 400 || !isAsciiPrintable(trimmed)) {
      return fail("bad_request", "?", cookies);
    }
    byokKey = trimmed;
  }
  const byok = byokKey !== null;
  const limit = byok ? CHAT_BYOK_DAILY_LIMIT : CHAT_DAILY_LIMIT;

  const kv = deps.kv ?? createRestKV(env.upstashUrl, env.upstashToken);
  const day = utcDay(deps.now ?? new Date());
  const keys = chatQuotaKeys({
    day,
    ipHash: hashIp(clientIp(req.headers.get("x-forwarded-for")), env.ipSalt),
    anonId,
    byok,
  });

  let quotaTaken = false;
  try {
    const taken = await takeChatQuota(kv, keys, limit);
    if (!taken.ok) return fail("quota", "?", cookies);
    quotaTaken = true;
    const remaining = limit - Math.max(taken.ipCount, taken.anonCount);

    const { book } = loadOzBook();
    const maxN = book.paragraphs.reduce((m, p) => Math.max(m, p.n), 0);
    const clampedN = Math.min(body.upToN, maxN);
    const chapter =
      book.chapters.find((c) => clampedN >= c.start_n && clampedN <= c.end_n) ??
      book.chapters[book.chapters.length - 1];
    if (!chapter) return fail("unavailable", "?", cookies);
    const system = buildChatSystemPrompt({
      title: book.title,
      author: book.author,
      chapterNumber: chapter.ch,
      chapterTitle: chapter.title,
      spoilers: body.spoilers,
      bookText: bookTextUpTo(book.paragraphs, book.chapters, body.upToN, body.spoilers),
    });
    const messages: UpstreamMessage[] = [{ role: "system", content: system }, ...body.messages];

    let reserved = 0;
    let spendTaken = false;
    let dailyTaken = false;
    const dayKey = dailySpendKey(day);
    // Each reserve is refunded at most once: flags clear only after the
    // write lands, like server/images/orchestrate.ts.
    const refundAll = async (): Promise<void> => {
      try {
        if (dailyTaken) {
          await kv.decrBy(dayKey, reserved);
          dailyTaken = false;
        }
      } catch {
        // Redis down: nothing reserved server-side to retry against.
      }
      try {
        if (spendTaken) {
          await kv.decrBy(spendKey(), reserved);
          spendTaken = false;
        }
      } catch {
        // Redis down: nothing reserved server-side to retry against.
      }
      await refundChatQuota(kv, keys);
    };

    // A Redis failure between reserves must give back what was taken.
    try {
      if (!byok) {
        reserved = estimateCostMicro(messages.reduce((sum, m) => sum + m.content.length, 0));
        const total = await kv.incrBy(spendKey(), reserved);
        spendTaken = true;
        if (budgetExceeded(total, env.spendCapMicro)) {
          await refundAll();
          return fail("byok_required", chapter.ch, cookies);
        }
        const dailyTotal = await kv.incrBy(dayKey, reserved);
        dailyTaken = true;
        await kv.expire(dayKey, DAILY_SPEND_TTL_SEC);
        if (budgetExceeded(dailyTotal, env.dailySpendCapMicro)) {
          await refundAll();
          return fail("byok_required", chapter.ch, cookies);
        }
      }
    } catch {
      await refundAll().catch(() => undefined);
      return fail("unavailable", chapter.ch, cookies);
    }

    const createStreamer = deps.createStreamer ?? createChatStreamer;
    const streamer = createStreamer({ apiKey: byokKey ?? env.metaKey, fetchFn });
    const iter = streamer.stream({ messages, signal: req.signal })[Symbol.asyncIterator]();

    let headText: string | null = null;
    let usage: { promptTokens: number; cachedTokens: number; completionTokens: number } | null = null;
    try {
      let current = await iter.next();
      for (;;) {
        if (current.done) break;
        const chunk: ChatStreamChunk = current.value;
        if (chunk.type === "usage") {
          usage = chunk;
          current = await iter.next();
        } else {
          headText = chunk.text;
          break;
        }
      }
    } catch {
      await refundAll();
      return fail("unavailable", chapter.ch, cookies);
    }
    if (headText === null) {
      await refundAll();
      return fail("unavailable", chapter.ch, cookies);
    }
    const firstText: string = headText;

    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    for (const cookie of cookies) headers.append("Set-Cookie", cookie);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown): void => {
          try {
            controller.enqueue(encoder.encode(encodeSse(event, data)));
          } catch {
            // Client went away mid-write.
          }
        };
        const close = (): void => {
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        };
        let sent = 0;
        let usageState = usage;
        const pushText = (text: string): void => {
          const room = CHAT_MAX_ANSWER_CHARS - sent;
          if (room <= 0) return;
          const slice = text.slice(0, room);
          sent += slice.length;
          send("delta", { text: slice });
        };
        try {
          pushText(firstText);
          for (;;) {
            let next: IteratorResult<ChatStreamChunk>;
            try {
              next = await iter.next();
            } catch {
              if (!req.signal.aborted) {
                send("error", { code: "unavailable", message: CHAT_MESSAGES.unavailable });
              }
              close();
              return;
            }
            if (next.done) break;
            if (next.value.type === "usage") usageState = next.value;
            else pushText(next.value.text);
          }
        } catch {
          if (!req.signal.aborted) {
            send("error", { code: "unavailable", message: CHAT_MESSAGES.unavailable });
          }
          close();
          return;
        }
        if (!byok) {
          try {
            // No usage block: keep the whole reserve rather than refund a real answer.
            const diff = usageState ? usageCostMicro(usageState) - reserved : 0;
            if (diff !== 0) {
              await kv.incrBy(spendKey(), diff);
              await kv.incrBy(dayKey, diff);
            }
          } catch {
            // Best effort: the reserve already bounds the spend.
          }
        }
        send("done", byok ? {} : { remaining });
        close();
      },
      cancel() {
        void iter.return?.(undefined);
      },
    });
    return new Response(stream, { headers });
  } catch {
    if (quotaTaken) {
      try {
        await refundChatQuota(kv, keys);
      } catch {
        // Best effort: Redis is already unhealthy.
      }
    }
    return fail("unavailable", "?", cookies);
  }
}
