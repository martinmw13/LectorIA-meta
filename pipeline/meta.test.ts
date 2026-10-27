import { describe, expect, it } from "vitest";
import { createMetaClient } from "./meta";

const SCHEMA = { type: "object", properties: { v: { type: "number" } }, required: ["v"], additionalProperties: false };

function okResponse(content: string | null): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    { status: 200 },
  );
}

describe("completeJson retries", () => {
  it("tries empty content once more, then stops", async () => {
    let calls = 0;
    const client = createMetaClient({
      apiKey: "k",
      model: "m",
      fetchFn: (async () => {
        calls += 1;
        return calls === 1 ? okResponse(null) : okResponse('{"v":1}');
      }) as typeof fetch,
    });
    const result = await client.completeJson({ system: "s", user: "u", schemaName: "n", schema: SCHEMA });
    expect(result.data).toEqual({ v: 1 });
    expect(calls).toBe(2);
  });

  it("throws after two empty responses, not nine fetches", async () => {
    let calls = 0;
    const client = createMetaClient({
      apiKey: "k",
      model: "m",
      fetchFn: (async () => {
        calls += 1;
        return okResponse("");
      }) as typeof fetch,
    });
    await expect(client.completeJson({ system: "s", user: "u", schemaName: "n", schema: SCHEMA })).rejects.toThrow(
      /empty content/,
    );
    expect(calls).toBe(2);
  });

  it("lets fetchWithRetry own a dropped connection", async () => {
    let calls = 0;
    const client = createMetaClient({
      apiKey: "k",
      model: "m",
      fetchFn: (async () => {
        calls += 1;
        if (calls === 1) throw new Error("socket hang up");
        return okResponse('{"v":2}');
      }) as typeof fetch,
    });
    const result = await client.completeJson({ system: "s", user: "u", schemaName: "n", schema: SCHEMA });
    expect(result.data).toEqual({ v: 2 });
    expect(calls).toBe(2);
  });
});
