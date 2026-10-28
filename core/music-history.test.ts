import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, popHistory, pushHistory } from "./music-history";

describe("pushHistory", () => {
  it("ignores a null push", () => {
    expect(pushHistory(["a"], null)).toEqual(["a"]);
  });

  it("caps the stack at the limit", () => {
    const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => `t${i}`);
    expect(pushHistory(full, "new")).toHaveLength(HISTORY_LIMIT);
    expect(pushHistory(full, "new")[HISTORY_LIMIT - 1]).toBe("new");
  });
});

describe("popHistory", () => {
  it("returns null on empty", () => {
    expect(popHistory([])).toBeNull();
  });

  it("pops the last id without re-pushing", () => {
    expect(popHistory(["a", "b"])).toEqual({ hist: ["a"], id: "b" });
  });
});
