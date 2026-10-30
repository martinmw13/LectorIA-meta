import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBookmap } from "./bookmap";

const VALID = {
  bookId: "tiny",
  textVersion: "sha256:001",
  setting: { time_period: "", world: "", description: "" },
  characters: [],
  chapters: [],
  scenes: {},
  provenance: { date: "", model: "", input: "", requests: 0, prompt_tokens: 0, cached_tokens: 0, completion_tokens: 0, cost_usd: 0, estimated_usd: 0 },
};

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "load-bookmap-"));
  mkdirSync(join(root, "tiny"), { recursive: true });
  return root;
}

describe("loadBookmap", () => {
  it("returns null when the file is missing", () => {
    expect(loadBookmap("tiny", "sha256:001", makeRoot())).toBeNull();
    expect(loadBookmap("nope", "x")).toBeNull();
  });

  it("returns null for corrupt, invalid, or stale files", () => {
    const root = makeRoot();
    writeFileSync(join(root, "tiny", "bookmap.json"), "not json");
    expect(loadBookmap("tiny", "sha256:001", root)).toBeNull();
    writeFileSync(join(root, "tiny", "bookmap.json"), JSON.stringify({ ...VALID, characters: [{ id: "x" }] }));
    expect(loadBookmap("tiny", "sha256:001", root)).toBeNull();
    writeFileSync(join(root, "tiny", "bookmap.json"), JSON.stringify(VALID));
    expect(loadBookmap("tiny", "sha256:other", root)).toBeNull();
    expect(loadBookmap("other", "sha256:001", root)).toBeNull();
  });

  it("loads a valid map", () => {
    const root = makeRoot();
    writeFileSync(join(root, "tiny", "bookmap.json"), JSON.stringify(VALID));
    expect(loadBookmap("tiny", "sha256:001", root)).toEqual(VALID);
  });
});
