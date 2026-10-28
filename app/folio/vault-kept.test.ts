import { describe, expect, it } from "vitest";
import { keptLine } from "./vault";

describe("keptLine", () => {
  it("reads warmly for none, one and many pictures", () => {
    expect(keptLine(0)).toBe("Nothing kept yet");
    expect(keptLine(1)).toBe("1 picture kept");
    expect(keptLine(8)).toBe("8 pictures kept");
  });
});
