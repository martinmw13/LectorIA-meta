import { describe, expect, it } from "vitest";
import type { MusicSelection } from "@/core/music";
import { mixOffSelection, styleSelection } from "./music-transitions";

const session: MusicSelection = {
  mode: "random",
  soundtrackId: "orch-a",
  style: "orchestral",
};

describe("mix toggle off", () => {
  it("keeps the playing track's soundtrack and style", () => {
    expect(
      mixOffSelection(session, { soundtrack: "orch-b", style: "orchestral" }),
    ).toEqual({ mode: "soundtrack", soundtrackId: "orch-b", style: "orchestral" });
  });

  it("keeps the session values when nothing plays yet", () => {
    expect(mixOffSelection(session, null)).toEqual({
      mode: "soundtrack",
      soundtrackId: "orch-a",
      style: "orchestral",
    });
  });
});

describe("style change", () => {
  it("stores the new home and keeps the current mode", () => {
    expect(styleSelection(session, "solo", "solo-a")).toEqual({
      mode: "random",
      soundtrackId: "solo-a",
      style: "solo",
    });
    expect(
      styleSelection(
        { mode: "soundtrack", soundtrackId: "orch-a", style: "orchestral" },
        "solo",
        "solo-a",
      ),
    ).toEqual({ mode: "soundtrack", soundtrackId: "solo-a", style: "solo" });
  });
});
