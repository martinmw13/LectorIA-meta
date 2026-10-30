import { describe, expect, it } from "vitest";
import {
  MAX_RANGES_PER_SCENE,
  addRange,
  jaccard,
  parseRanges,
  pickReusable,
  rangeListKeyFor,
} from "./image-ranges";

describe("jaccard", () => {
  it("scores identical ranges 1", () => {
    expect(jaccard({ start: 5, end: 5 }, { start: 5, end: 5 })).toBe(1);
  });

  it("scores slight extensions high", () => {
    expect(jaccard({ start: 10, end: 13 }, { start: 10, end: 14 })).toBeCloseTo(0.8);
    expect(jaccard({ start: 10, end: 13 }, { start: 9, end: 13 })).toBeCloseTo(0.8);
  });

  it("scores a much larger selection low", () => {
    expect(jaccard({ start: 5, end: 5 }, { start: 3, end: 9 })).toBeCloseTo(1 / 7);
    expect(jaccard({ start: 10, end: 11 }, { start: 10, end: 20 })).toBeLessThan(0.5);
  });

  it("scores disjoint ranges 0", () => {
    expect(jaccard({ start: 1, end: 2 }, { start: 4, end: 6 })).toBe(0);
  });
});

describe("pickReusable", () => {
  it("reuses the same paragraph", () => {
    expect(pickReusable([{ start: 5, end: 5 }], { start: 5, end: 5 })).toEqual({ start: 5, end: 5 });
  });

  it("reuses slight extensions, threshold inclusive", () => {
    expect(pickReusable([{ start: 10, end: 13 }], { start: 10, end: 14 })).toEqual({
      start: 10,
      end: 13,
    });
    expect(pickReusable([{ start: 5, end: 5 }], { start: 5, end: 6 })).toEqual({ start: 5, end: 5 });
    expect(pickReusable([{ start: 5, end: 5 }], { start: 4, end: 6 })).toEqual({ start: 5, end: 5 });
    expect(pickReusable([{ start: 16, end: 17 }], { start: 16, end: 19 })).toEqual({
      start: 16,
      end: 17,
    });
  });

  it("passes on a much larger selection", () => {
    expect(pickReusable([{ start: 5, end: 5 }], { start: 3, end: 9 })).toBeNull();
    expect(pickReusable([{ start: 10, end: 11 }], { start: 10, end: 20 })).toBeNull();
    expect(pickReusable([{ start: 3, end: 4 }], { start: 3, end: 12 })).toBeNull();
    expect(pickReusable([{ start: 5, end: 5 }], { start: 3, end: 7 })).toBeNull();
  });

  it("returns null for disjoint ranges", () => {
    expect(pickReusable([{ start: 1, end: 2 }], { start: 4, end: 6 })).toBeNull();
  });

  it("picks the best of several, first on ties", () => {
    const cached = [
      { start: 1, end: 2 },
      { start: 10, end: 20 },
      { start: 10, end: 12 },
    ];
    expect(pickReusable(cached, { start: 10, end: 13 })).toEqual({ start: 10, end: 12 });
    const tied = [
      { start: 5, end: 6 },
      { start: 4, end: 5 },
    ];
    expect(pickReusable(tied, { start: 5, end: 5 })).toEqual({ start: 5, end: 6 });
  });
});

describe("parseRanges and addRange", () => {
  it("drops garbage, never throws", () => {
    expect(parseRanges(null)).toEqual([]);
    expect(parseRanges("")).toEqual([]);
    expect(parseRanges("nope{")).toEqual([]);
    expect(parseRanges('{"start":1}')).toEqual([]);
    expect(
      parseRanges(
        JSON.stringify([
          { start: 1, end: 2 },
          { start: 1.5, end: 2 },
          { start: 3, end: 2 },
          { start: "4", end: 5 },
          null,
          7,
        ]),
      ),
    ).toEqual([{ start: 1, end: 2 }]);
  });

  it("dedupes and caps at the newest MAX_RANGES_PER_SCENE", () => {
    const one = addRange([], { start: 1, end: 1 });
    expect(addRange(one, { start: 1, end: 1 })).toEqual(one);
    let list: { start: number; end: number }[] = [];
    for (let i = 0; i < MAX_RANGES_PER_SCENE + 5; i++) {
      list = addRange(list, { start: i, end: i });
    }
    expect(list).toHaveLength(MAX_RANGES_PER_SCENE);
    expect(list[0]).toEqual({ start: 5, end: 5 });
  });
});

describe("rangeListKeyFor", () => {
  const req = { kind: "passage", bookId: "oz", textVersion: "t", n: 3 } as const;

  it("lives next to the image key and differs by scene", () => {
    expect(rangeListKeyFor(req, "s1")).toBe("img:ranges:images/oz/t/v4/s1");
    expect(rangeListKeyFor(req, "s2")).toBe("img:ranges:images/oz/t/v4/s2");
  });

  it("differs by style like imageKey does", () => {
    expect(rangeListKeyFor({ ...req, style: { kind: "preset", id: "pencil" } }, "s1")).toBe(
      "img:ranges:images/oz/t/v4/style-pencil/s1",
    );
  });
});
