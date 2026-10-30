import { describe, expect, it } from "vitest";
import { isStandardMuse, metaCostUsd, modalCostUsd } from "./prices";

const usage = { prompt: 1_000_000, cached: 0, completion: 1_000_000 };

describe("meta pricing by model", () => {
  it("detects Standard Muse models", () => {
    expect(isStandardMuse("muse-spark-1.3")).toBe(true);
    expect(isStandardMuse("muse-spark-1.3-contributor")).toBe(false);
    expect(isStandardMuse(undefined)).toBe(false);
  });

  it("bills Standard Muse at Standard rates and contributor at contributor rates", () => {
    expect(metaCostUsd(usage, "muse-spark-1.3")).toBeCloseTo(modalCostUsd(usage));
    expect(metaCostUsd(usage, "muse-spark-1.3-contributor")).toBeCloseTo(0.3);
    expect(metaCostUsd(usage)).toBeCloseTo(0.3);
  });
});
