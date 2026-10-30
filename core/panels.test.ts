import { describe, expect, it } from "vitest";
import { panelCaption } from "./reader";
import { buildChapterPrompt, chapterPanels, panelRows } from "./panels";

function scenes(n: number): { id: string; summary: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    summary: `The friends meet a wonder in scene ${i + 1}, and Dorothy laughs with joy.`,
  }));
}

describe("chapterPanels", () => {
  it("keeps one panel per scene at 6 or fewer", () => {
    for (const n of [1, 5, 6]) {
      const groups = chapterPanels(scenes(n));
      expect(groups).toHaveLength(n);
      expect(groups.map((g) => g.sceneIds)).toEqual(scenes(n).map((s) => [s.id]));
      expect(groups[0]?.caption).toBe(panelCaption(scenes(n)[0]?.summary ?? ""));
      expect(groups[0]?.description).toBe(scenes(n)[0]?.summary);
    }
  });

  it("merges 7 scenes into 2,1,1,1,1,1", () => {
    const groups = chapterPanels(scenes(7));
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.sceneIds.length)).toEqual([2, 1, 1, 1, 1, 1]);
    expect(groups.flatMap((g) => g.sceneIds)).toEqual(scenes(7).map((s) => s.id));
    expect(groups[0]?.sceneIds).toEqual(["s1", "s2"]);
    expect(groups[0]?.caption).toBe(panelCaption(scenes(7)[0]?.summary ?? ""));
  });

  it("merges 14 scenes into 3,3,2,2,2,2 with joined descriptions", () => {
    const groups = chapterPanels(scenes(14));
    expect(groups.map((g) => g.sceneIds.length)).toEqual([3, 3, 2, 2, 2, 2]);
    expect(groups.flatMap((g) => g.sceneIds)).toEqual(scenes(14).map((s) => s.id));
    const first = scenes(14);
    expect(groups[0]?.description).toBe(
      [first[0]?.summary, first[1]?.summary, first[2]?.summary].join(" "),
    );
  });

  it("returns no panels for no scenes", () => {
    expect(chapterPanels([])).toEqual([]);
  });
});

describe("panelRows", () => {
  it("uses the fixed layouts", () => {
    expect(panelRows(1)).toEqual([1]);
    expect(panelRows(2)).toEqual([1, 1]);
    expect(panelRows(3)).toEqual([1, 2]);
    expect(panelRows(4)).toEqual([2, 2]);
    expect(panelRows(5)).toEqual([2, 1, 2]);
    expect(panelRows(6)).toEqual([2, 2, 2]);
  });

  it("rejects counts with no layout", () => {
    for (const n of [0, 7]) expect(() => panelRows(n)).toThrow(RangeError);
  });
});

describe("buildChapterPrompt", () => {
  const groups = chapterPanels(scenes(7));

  it("states the grid and numbers every panel in reading order", () => {
    const prompt = buildChapterPrompt({ chapterTitle: "The Cyclone", panels: groups });
    expect(prompt).toContain('Chapter "The Cyclone"');
    expect(prompt).toContain("6 panels in 3 rows");
    expect(prompt).toContain("row 1 has 2, row 2 has 2, row 3 has 2");
    expect(prompt).toContain("read left to right, top to bottom");
    for (let i = 1; i <= 6; i++) expect(prompt).toContain(`Panel ${i}:`);
    expect(prompt.indexOf("Panel 1:")).toBeLessThan(prompt.indexOf("Panel 6:"));
  });

  it("adds the style line and the no-text rule", () => {
    const prompt = buildChapterPrompt({ chapterTitle: "The Cyclone", panels: groups });
    expect(prompt).toContain("Denslow");
    expect(prompt).toContain(
      "No text, letters, numbers, captions, sound effects or speech balloons anywhere",
    );
    const styled = buildChapterPrompt({
      chapterTitle: "The Cyclone",
      panels: groups,
      style: { kind: "preset", id: "watercolor" },
    });
    expect(styled).not.toContain("Denslow");
    expect(styled).toContain("Art style: soft storybook watercolor painting,");
  });

  it("uses the generic line for a non-Oz book", () => {
    const prompt = buildChapterPrompt({
      chapterTitle: "Down the Rabbit-Hole",
      panels: groups,
      book: { id: "alice", title: "Alice's Adventures in Wonderland", author: "Lewis Carroll" },
    });
    expect(prompt).not.toContain("Denslow");
    expect(prompt).not.toContain("silver shoes");
    expect(prompt).toContain("Alice's Adventures in Wonderland");
    expect(prompt).toContain("speech balloons");
  });

  it("clips each panel description near 300 chars", () => {
    const summary = `Dorothy ${"walks ".repeat(200)}home.`;
    const long = chapterPanels([{ id: "s1", summary }]);
    const prompt = buildChapterPrompt({ chapterTitle: "T", panels: long });
    expect(prompt).toContain("Dorothy walks");
    expect(prompt).not.toContain(summary);
    const after = prompt.split("Panel 1: ")[1] ?? "";
    expect(after.length).toBeLessThan(summary.length);
  });
});
