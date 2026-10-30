"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BYOK_HEADER,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_QUESTION_CHARS,
  type ChatMessage,
  type ChatRole,
} from "@/core/chat";

export type ChatStatus = "idle" | "loading" | "streaming" | "error";
export type ByokReason = "quota" | "byok_required";

export interface UseChatOptions {
  bookId: "oz";
  upToN: number;
  byokKey: string | null;
  turnstileToken: string | null;
  onTokenUsed?: () => void;
}

export interface ChatSnapshot {
  messages: ChatMessage[];
  remaining: number | null;
  spoilers: boolean;
}

const STORE_KEY = "lectoria:chat:oz";

function readStored(): ChatSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatSnapshot>;
    if (!Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
    return {
      messages,
      remaining: typeof parsed.remaining === "number" ? parsed.remaining : null,
      spoilers: parsed.spoilers === true,
    };
  } catch {
    return null; // Corrupt entry: start fresh, never throw.
  }
}

function safeJson(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

function errorCodeOf(value: unknown): string {
  if (value && typeof value === "object" && "code" in value) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === "string" && code !== "") return code;
  }
  return "unavailable";
}

// First byte and idle budgets: the server answers with headers quickly
// and streams at once, so a quiet line means it is stuck, not thinking.
// Never a total budget: a long healthy answer must never trip it.
export const CHAT_FIRST_BYTE_MS = 30_000;
export const CHAT_IDLE_MS = 30_000;

const IDLE_TIMEOUT = Symbol("chat-idle-timeout");

// One read with an idle budget. Handlers stay attached, so a won read
// settling late after the timeout never rejects unhandled.
function readWithIdle(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(IDLE_TIMEOUT), ms);
    reader.read().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Minimal SSE reader: splits on blank lines, reads event:/data: pairs.
// Each read gets the idle budget; a stall throws the retryable code.
export async function runStream(
  res: Response,
  signal: AbortSignal,
  onBlock: (event: string, data: string) => void,
  idleMs: number = CHAT_IDLE_MS,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw { code: "unavailable" };
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await readWithIdle(reader, idleMs);
    } catch (err) {
      if (err === IDLE_TIMEOUT) {
        try {
          await reader.cancel();
        } catch {
          // Already closed; the timeout itself is the outcome.
        }
        throw { code: "unavailable" };
      }
      throw err;
    }
    const { done, value } = read;
    if (signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        // Already closed; the abort itself is the outcome.
      }
      return;
    }
    buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "";
      const lines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
      }
      onBlock(event, lines.join("\n"));
    }
    if (done) break;
  }
}

export function useChat(opts: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [spoilers, setSpoilers] = useState(false);
  const [byok, setByok] = useState<ByokReason | null>(null);
  const [needHuman, setNeedHuman] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const spoilersRef = useRef(false);
  spoilersRef.current = spoilers;
  const msgsRef = useRef<ChatMessage[]>([]);
  msgsRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);

  // Restore the text-only conversation once, on mount.
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    msgsRef.current = stored.messages;
    setMessages(stored.messages);
    setRemaining(stored.remaining);
    setSpoilers(stored.spoilers);
  }, []);

  // Persist text only: never the key, never the token.
  useEffect(() => {
    try {
      const snap: ChatSnapshot = { messages, remaining, spoilers };
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(snap));
    } catch {
      // Private mode or full storage: the chat still works for the visit.
    }
  }, [messages, remaining, spoilers]);

  const fail = useCallback((code: string) => {
    abortRef.current = null;
    if (code === "quota" || code === "byok_required") {
      setByok(code);
      setStatus("idle");
    } else if (code === "human") {
      setNeedHuman(true);
      setStatus("idle");
    } else {
      setStatus("error");
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus((s) => (s === "loading" || s === "streaming" ? "idle" : s));
  }, []);

  const startOver = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    msgsRef.current = [];
    setMessages([]);
    setRemaining(null);
    setSpoilers(false);
    setByok(null);
    setNeedHuman(false);
    setStatus("idle");
    try {
      window.sessionStorage.removeItem(STORE_KEY);
    } catch {
      // Nothing stored: nothing to clear.
    }
  }, []);

  // Key and token travel as arguments so a submit that sets them in the
  // same tick still sends them; props alone would read the stale render.
  const sendHistory = useCallback(
    async (history: ChatMessage[], key: string | null, token: string | null) => {
      const o = optsRef.current;
      const ctrl = new AbortController();
      abortRef.current?.abort();
      abortRef.current = ctrl;
      setStatus("loading");
      setByok(null);
      const payload = {
        bookId: o.bookId,
        upToN: o.upToN,
        spoilers: spoilersRef.current,
        messages: history,
        ...(token ? { turnstileToken: token } : {}),
      };
      o.onTokenUsed?.();
      try {
        // First-byte budget only: once headers land the timer clears, so a
        // long healthy stream never trips it; idleness is runStream's job.
        const firstByte = new AbortController();
        const firstTimer = setTimeout(() => firstByte.abort(), CHAT_FIRST_BYTE_MS);
        let res: Response;
        try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(key ? { [BYOK_HEADER]: key } : {}),
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.any([ctrl.signal, firstByte.signal]),
          });
        } finally {
          clearTimeout(firstTimer);
        }
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("text/event-stream")) {
          let code = "unavailable";
          try {
            code = errorCodeOf(await res.json());
          } catch {
            // No JSON error body: keep the generic code.
          }
          throw { code };
        }
        let streamed = false;
        let finished = false;
        const role: ChatRole = "assistant";
        await runStream(res, ctrl.signal, (event, data) => {
          if (event === "delta") {
            const text = (safeJson(data) as { text?: unknown } | null)?.text;
            if (typeof text !== "string" || text === "") return;
            streamed = true;
            setStatus("streaming");
            const next = [...msgsRef.current];
            const last = next[next.length - 1];
            if (last && last.role === role) {
              next[next.length - 1] = { role, content: last.content + text };
            } else {
              next.push({ role, content: text });
            }
            msgsRef.current = next;
            setMessages(next);
          } else if (event === "done") {
            const left = (safeJson(data) as { remaining?: unknown } | null)?.remaining;
            if (typeof left === "number") setRemaining(left);
            finished = true;
            setStatus("idle");
            abortRef.current = null;
          } else if (event === "error") {
            throw { code: errorCodeOf(safeJson(data)) };
          }
        });
        // A cut stream (server kill, dropped line) ends without done: show
        // the retry state instead of streaming forever.
        if ((!streamed || !finished) && !ctrl.signal.aborted) throw { code: "unavailable" };
      } catch (err) {
        // Stop stays silent; anything else (first-byte or idle timeout,
        // network, server error) lands here unaborted and shows its state.
        if (ctrl.signal.aborted) return;
        throw err;
      }
    },
    [],
  );

  const submit = useCallback(
    (history: ChatMessage[], key: string | null, token: string | null) => {
      void sendHistory(history, key, token).catch((err: unknown) => {
        fail(typeof err === "string" ? err : errorCodeOf(err));
      });
    },
    [sendHistory, fail],
  );

  const send = useCallback(
    (question: string) => {
      const o = optsRef.current;
      const q = question.trim().slice(0, CHAT_MAX_QUESTION_CHARS);
      if (q === "" || abortRef.current) return;
      const next: ChatMessage[] = [...msgsRef.current, { role: "user", content: q }];
      msgsRef.current = next;
      setMessages(next);
      submit(next.slice(-(CHAT_MAX_MESSAGES - 1)), o.byokKey, o.turnstileToken);
    },
    [submit],
  );

  // "Try again" and post-key/post-check retries resend the same question,
  // kept in place. Overrides cover keys and tokens set in the same tick.
  const retry = useCallback(
    (overrides?: { key?: string | null; token?: string | null }) => {
      const o = optsRef.current;
      const current = msgsRef.current;
      for (let i = current.length - 1; i >= 0; i--) {
        if (current[i]?.role === "user") {
          const trimmed = current.slice(0, i + 1);
          msgsRef.current = trimmed;
          setMessages(trimmed);
          submit(
            trimmed.slice(-(CHAT_MAX_MESSAGES - 1)),
            overrides && "key" in overrides ? (overrides.key ?? null) : o.byokKey,
            overrides && "token" in overrides ? (overrides.token ?? null) : o.turnstileToken,
          );
          return;
        }
      }
    },
    [submit],
  );

  return {
    messages,
    status,
    remaining,
    spoilers,
    setSpoilers,
    byok,
    needHuman,
    setNeedHuman,
    send,
    retry,
    stop,
    startOver,
    busy: status === "loading" || status === "streaming",
  };
}
