import "server-only";
import type { KV } from "@/core/images";

// Upstash REST client over built-in fetch. Single commands only, no
// pipeline: the route issues few calls and a helper would add lines.
export function createRestKV(url: string, token: string): KV {
  async function cmd<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`kv status ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error !== undefined) throw new Error("kv error");
    return json.result as T;
  }
  return {
    get: (key) => cmd<string | null>(["GET", key]),
    setNxEx: async (key, value, exSec) =>
      (await cmd<string | null>(["SET", key, value, "NX", "EX", exSec])) === "OK",
    set: async (key, value) => {
      await cmd(["SET", key, value]);
    },
    incr: (key) => cmd<number>(["INCR", key]),
    incrBy: (key, by) => cmd<number>(["INCRBY", key, by]),
    decr: (key) => cmd<number>(["DECR", key]),
    decrBy: (key, by) => cmd<number>(["DECRBY", key, by]),
    expire: async (key, sec) => {
      await cmd(["EXPIRE", key, sec]);
    },
    // Lua compare-and-delete: an expired lock must not free a new owner.
    releaseIfToken: async (key, tokenValue) =>
      (await cmd<number>([
        "EVAL",
        'if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',
        1,
        key,
        tokenValue,
      ])) === 1,
  };
}
