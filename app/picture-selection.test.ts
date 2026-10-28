import { describe, expect, it } from "vitest";
import { pickStartN } from "./picture-selection";
import type { ParaEntry } from "./picture-selection";

const entries: ParaEntry[] = [
  { id: "c1p1", n: 1 },
  { id: "c1p2", n: 2 },
  { id: "c1p3", n: 3 },
];

describe("pickStartN", () => {
  it("picks the anchor paragraph for a forward drag", () => {
    expect(pickStartN(entries, "c1p1", "c1p3")).toBe(1);
  });

  it("picks the focus paragraph for a reversed drag", () => {
    expect(pickStartN(entries, "c1p3", "c1p1")).toBe(1);
  });

  it("handles a click inside one paragraph", () => {
    expect(pickStartN(entries, "c1p2", "c1p2")).toBe(2);
  });

  it("returns null outside the book", () => {
    expect(pickStartN(entries, null, null)).toBeNull();
    expect(pickStartN(entries, "other", "missing")).toBeNull();
  });
});
