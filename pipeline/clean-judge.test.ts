import { describe, expect, it, vi } from "vitest";
import { createCleanJudge } from "./clean-judge";
import { costUsdFor, metaCostUsd } from "./prices";
import type { MetaClient } from "./meta";

function clientWith(
  data: unknown,
  usage = { promptTokens: 10, cachedTokens: 2, completionTokens: 5 },
  extra?: Partial<MetaClient>,
): {
  meta: MetaClient;
  calls: { system: string; schema: Record<string, unknown> }[];
} {
  const calls: { system: string; schema: Record<string, unknown> }[] = [];
  const meta: MetaClient = {
    model: "m",
    completeJson: vi.fn(async ({ system, schema }) => {
      calls.push({ system, schema });
      return { data, ...usage };
    }),
    ...extra,
  };
  return { meta, calls };
}

const input = {
  sections: [{ id: "a", title: "A", words: 5, head: ["A"], tail: ["A"] }],
  headWindow: [],
  tailWindow: [],
};

function validData() {
  return {
    sections: [{ id: "a", verdict: "content", kind: "content", reason: "story" }],
    headCut: 1,
    tailCut: 2,
  };
}

describe("createCleanJudge", () => {
  it("builds an untrusted-data prompt with a strict schema and maps usage", async () => {
    const { meta, calls } = clientWith(validData());
    const result = await createCleanJudge(meta)(input);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toContain("untrusted");
    expect(calls[0]?.system).toContain("Return only JSON");
    const schema = calls[0]?.schema as Record<string, unknown>;
    expect(schema["additionalProperties"]).toBe(false);
    const props = schema["properties"] as Record<string, unknown>;
    const items = (props["sections"] as Record<string, unknown>)["items"] as Record<string, unknown>;
    const kinds = (items["properties"] as Record<string, unknown>)["kind"] as Record<string, unknown>;
    expect(kinds["enum"]).toContain("transcriber_note");
    expect(kinds["enum"]).toContain("advertisement");
    expect(result).toEqual({
      sections: [{ id: "a", verdict: "content", kind: "content", reason: "story" }],
      headCut: 1,
      tailCut: 2,
      provider: "meta",
      model: "m",
      promptTokens: 10,
      completionTokens: 5,
      cachedTokens: 2,
      costUsd: metaCostUsd({ prompt: 10, cached: 2, completion: 5 }),
      fallbackUsed: false,
    });
  });

  it("reports modal provider and per-token shared-endpoint cost", async () => {
    const { meta } = clientWith(validData(), undefined, { provider: "modal", model: "meta-models/Muse-Spark-Open-816B-A42B" });
    const result = await createCleanJudge(meta)(input);
    expect(result?.provider).toBe("modal");
    expect(result?.fallbackUsed).toBe(false);
    expect(result?.costUsd).toBe(
      costUsdFor("meta-models/Muse-Spark-Open-816B-A42B", { prompt: 10, cached: 2, completion: 5 }),
    );
  });

  it("returns null on thrown errors and invalid shapes", async () => {
    const failing: MetaClient = {
      model: "m",
      completeJson: async () => {
        throw new Error("down");
      },
    };
    await expect(createCleanJudge(failing)(input)).resolves.toBeNull();
    const { meta } = clientWith({ sections: "nope", headCut: 0, tailCut: 0 });
    await expect(createCleanJudge(meta)(input)).resolves.toBeNull();
  });

  it("coerces unknown kinds to other", async () => {
    const { meta } = clientWith({
      sections: [{ id: "a", verdict: "uncertain", kind: "mystery", reason: "" }],
      headCut: 0,
      tailCut: 0,
    });
    const result = await createCleanJudge(meta)(input);
    expect(result?.sections[0]?.kind).toBe("other");
  });

  it("calls the fallback once when the primary throws", async () => {
    const failing: MetaClient = {
      model: "primary",
      provider: "modal",
      completeJson: async () => {
        throw new Error("down");
      },
    };
    const { meta, calls } = clientWith(validData());
    const result = await createCleanJudge(failing, meta)(input);
    expect(calls).toHaveLength(1);
    expect(result?.provider).toBe("meta");
    expect(result?.fallbackUsed).toBe(true);
    expect(result?.model).toBe("m");
  });

  it("calls the fallback once when the primary returns invalid data", async () => {
    const { meta: bad } = clientWith({ sections: "nope", headCut: 0, tailCut: 0 }, undefined, {
      provider: "modal",
      model: "meta-models/Muse-Spark-Open-816B-A42B",
    });
    const { meta, calls } = clientWith(validData());
    const result = await createCleanJudge(bad, meta)(input);
    expect(calls).toHaveLength(1);
    expect(result?.provider).toBe("meta");
    expect(result?.fallbackUsed).toBe(true);
  });

  it("returns null without raw errors when both providers fail", async () => {
    const failing: MetaClient = {
      model: "primary",
      completeJson: async () => {
        throw new Error("primary blew up: secret detail");
      },
    };
    const { meta } = clientWith({ sections: "nope", headCut: 0, tailCut: 0 });
    await expect(createCleanJudge(failing, meta)(input)).resolves.toBeNull();
  });
});
