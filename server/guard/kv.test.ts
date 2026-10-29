import { afterEach, describe, expect, it, vi } from "vitest";
import { createRestKV } from "./kv";

afterEach(() => vi.unstubAllGlobals());

describe("createRestKV", () => {
  it("bounds every Upstash call with an abort timeout", async () => {
    const fetchMock = vi.fn(async () => Response.json({ result: "v" }));
    vi.stubGlobal("fetch", fetchMock);
    await createRestKV("https://kv.example", "t").get("k");
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
