import { describe, expect, it, vi } from "vitest";
import { createCleanJudge } from "./clean-judge";
import { metaCostUsd } from "./prices";
import type { MetaClient } from "./meta";

function clientWith(data: unknown, usage = { promptTokens: 10, cachedTokens: 2, completionTokens: 5 }): {
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
  };
  return { meta, calls };
}

const input = {
  sections: [{ id: "a", title: "A", words: 5, head: ["A"], tail: ["A"] }],
  headWindow: [],
  tailWindow: [],
};

describe("createCleanJudge", () => {
  it("builds an untrusted-data prompt with a strict schema and maps usage", async () => {
    const { meta, calls } = clientWith({
      sections: [{ id: "a", verdict: "content", kind: "content", reason: "story" }],
      headCut: 1,
      tailCut: 2,
    });
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
      model: "m",
      promptTokens: 10,
      completionTokens: 5,
      cachedTokens: 2,
      costUsd: metaCostUsd({ prompt: 10, cached: 2, completion: 5 }),
    });
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
});
