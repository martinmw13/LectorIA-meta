import { describe, expect, it } from "vitest";
import { createCleanJudgeFromEnv } from "./clean-providers";
import type { JudgeInput } from "../core/clean";

const INPUT: JudgeInput = { sections: [], headWindow: [], tailWindow: [] };

function judgeBody() {
  return JSON.stringify({ sections: [], headCut: 0, tailCut: 0 });
}

function recordingFetch(seen: { url: string; model: string }[], failUrls: string[] = []) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const text = typeof init?.body === "string" ? init.body : "";
    seen.push({ url: String(url), model: (JSON.parse(text) as { model?: string }).model ?? "" });
    if (failUrls.includes(String(url))) throw new Error("socket hang up");
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: judgeBody() } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("createCleanJudgeFromEnv", () => {
  it("throws when no cleaning LLM is configured", () => {
    expect(() => createCleanJudgeFromEnv({})).toThrow(
      "no cleaning LLM configured (set MODAL_CLEAN_URL+MODAL_CLEAN_TOKEN or META_API_KEY)",
    );
    expect(() => createCleanJudgeFromEnv({ MODAL_CLEAN_URL: "https://m.test/chat" })).toThrow(
      "no cleaning LLM configured",
    );
  });

  it("uses Modal alone when only Modal env is set", async () => {
    const seen: { url: string; model: string }[] = [];
    const judge = createCleanJudgeFromEnv(
      { MODAL_CLEAN_URL: "https://m.test/chat", MODAL_CLEAN_TOKEN: "tok" },
      recordingFetch(seen),
    );
    const result = await judge(INPUT);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://m.test/chat");
    expect(seen[0]?.model).toBe("meta-models/Muse-Spark-Open-816B-A42B");
    expect(result?.provider).toBe("modal");
    expect(result?.fallbackUsed).toBe(false);
  });

  it("uses Meta alone with the contributor default", async () => {
    const seen: { url: string; model: string }[] = [];
    const judge = createCleanJudgeFromEnv({ META_API_KEY: "k" }, recordingFetch(seen));
    const result = await judge(INPUT);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.meta.ai/v1/chat/completions");
    expect(seen[0]?.model).toBe("muse-spark-1.3-contributor");
    expect(result?.provider).toBe("meta");
    expect(result?.fallbackUsed).toBe(false);
  });

  it("prefers Modal with Meta fallback and honors model overrides", async () => {
    const seen: { url: string; model: string }[] = [];
    const judge = createCleanJudgeFromEnv(
      {
        MODAL_CLEAN_URL: "https://m.test/chat",
        MODAL_CLEAN_TOKEN: "tok",
        MODAL_CLEAN_MODEL: "meta-models/custom",
        META_API_KEY: "k",
        CLEAN_MODEL: "custom-meta",
      },
      recordingFetch(seen, ["https://m.test/chat"]),
    );
    const result = await judge(INPUT);
    // The primary owns retries, then the fallback gets one call.
    const urls = seen.map((s) => s.url);
    expect(urls.length).toBeGreaterThan(1);
    expect(urls[urls.length - 1]).toBe("https://api.meta.ai/v1/chat/completions");
    expect(urls.slice(0, -1).every((url) => url === "https://m.test/chat")).toBe(true);
    expect(seen[0]?.model).toBe("meta-models/custom");
    expect(seen[seen.length - 1]?.model).toBe("custom-meta");
    expect(result?.provider).toBe("meta");
    expect(result?.fallbackUsed).toBe(true);
  });

});
