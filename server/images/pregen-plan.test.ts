import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLibrary } from "@/core/library";
import { resolveBooks } from "./pregen-plan";

const ready = loadLibrary()
  .map((b) => b.id)
  .filter((id) => existsSync(`data/books/${id}`));

describe("resolveBooks", () => {
  it("defaults to oz", () => {
    expect(resolveBooks(undefined, ready)).toEqual(["oz"]);
  });

  it("resolves all-shelf to every ready book except oz", () => {
    const all = resolveBooks("all-shelf", ready);
    expect(all).toHaveLength(9);
    expect(all).not.toContain("oz");
    expect(all).toContain("alice");
  });

  it("resolves one id", () => {
    expect(resolveBooks("alice", ready)).toEqual(["alice"]);
  });

  it("rejects unknown ids and lists the valid ones", () => {
    expect(() => resolveBooks("nope", ready)).toThrow("unknown book: nope");
    expect(() => resolveBooks("nope", ready)).toThrow("all-shelf");
  });
});
