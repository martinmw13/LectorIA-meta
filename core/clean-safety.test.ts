import { describe, expect, it } from "vitest";
import { cleanSections } from "./clean";
import type { Judge, JudgeResult, RawSection } from "./clean";

function section(id: string, heads: string[], wordsPerPara: number[], docTitle = "Doc"): RawSection {
  return {
    id,
    href: `${id}.xhtml`,
    linear: true,
    types: [],
    docTitle,
    navLabel: null,
    blocks: [
      ...heads.map((text) => ({ text, heading: true })),
      ...wordsPerPara.map((n, i) => ({ text: `para ${i} ${"word ".repeat(n).trim()}`, heading: false })),
    ],
  };
}

function tale(id: string, words: number): RawSection {
  return section(id, ["A Tale"], [words], "A Tale");
}

function fakeJudge(verdictFor: (id: string) => JudgeResult["sections"][number]): Judge {
  return async (input) => ({
    sections: input.sections.map((s) => verdictFor(s.id)),
    headCut: 0,
    tailCut: 0,
    model: "fake",
    promptTokens: 1,
    completionTokens: 1,
    cachedTokens: 0,
    costUsd: 0,
  });
}

const content = (id: string) => ({ id, verdict: "content" as const, kind: "content", reason: "ok" });

describe("judge safety", () => {
  it("uncertain stays kept and flagged", async () => {
    const judge = fakeJudge((id) => ({ id, verdict: "uncertain", kind: "other", reason: "not sure" }));
    const { chapters, report } = await cleanSections("B", [tale("a", 10)], judge);
    expect(chapters.map((c) => c.title)).toEqual(["A Tale"]);
    expect(report.flagged.map((f) => f.sectionId)).toEqual(["a"]);
  });

  it("unknown verdict ids are ignored", async () => {
    const judge: Judge = async () => ({
      sections: [{ id: "ghost", verdict: "non_content", kind: "other", reason: "no such section" }],
      headCut: 0,
      tailCut: 0,
      model: "fake",
      promptTokens: 1,
      completionTokens: 1,
      cachedTokens: 0,
      costUsd: 0,
    });
    const { chapters, report } = await cleanSections("B", [tale("a", 10)], judge);
    expect(chapters.map((c) => c.title)).toEqual(["A Tale"]);
    expect(report.removed).toEqual([]);
  });

  it("edge non_content is removed", async () => {
    const judge = fakeJudge((id) =>
      id === "edge" ? { id, verdict: "non_content", kind: "advertisement", reason: "ad" } : content(id),
    );
    const { chapters, report } = await cleanSections("B", [section("edge", [], [5], "Edge"), tale("mid", 10), tale("end", 10)], judge);
    expect(report.removed.map((r) => r.sectionId)).toContain("edge");
    expect(chapters).toHaveLength(2);
  });

  it("long interior non_content stays kept and flagged", async () => {
    const judge = fakeJudge((id) =>
      id === "long"
        ? { id, verdict: "non_content", kind: "advertisement", reason: "x".repeat(200) }
        : content(id),
    );
    const { chapters, report } = await cleanSections("B", [tale("a", 10), tale("long", 2100), tale("c", 10)], judge);
    expect(chapters.map((c) => c.sectionIds[0])).toContain("long");
    expect(report.flagged.map((f) => f.sectionId)).toContain("long");
    expect(report.flagged.every((f) => f.reason.length <= 120)).toBe(true);
  });

  it("judge null keeps deterministic output and records the failure", async () => {
    const { chapters, report } = await cleanSections("B", [tale("a", 10)], async () => null);
    expect(chapters).toHaveLength(1);
    expect(report.llm?.error).toBe("failed");
  });

  it("judge throw keeps deterministic output and records the failure", async () => {
    const judge: Judge = async () => {
      throw new Error("boom");
    };
    const { chapters, report } = await cleanSections("B", [tale("a", 10)], judge);
    expect(chapters).toHaveLength(1);
    expect(report.llm?.error).toBe("failed");
  });

  it("headCut and tailCut clamp to the window length", async () => {
    const judge: Judge = async (input) => ({
      sections: input.sections.map((s) => content(s.id)),
      headCut: 99,
      tailCut: 99,
      model: "fake",
      promptTokens: 1,
      completionTokens: 1,
      cachedTokens: 0,
      costUsd: 0,
    });
    const first = section("first", ["First Tale"], [3, 3, 3, 3, 3, 3, 3, 3], "T");
    const last = section("last", ["Last Tale"], [4, 4, 4, 4, 4, 4, 4, 4, 4, 4], "T");
    const { chapters, report } = await cleanSections("B", [first, last], judge);
    // 6-block head window, 8-block tail window.
    expect(report.removed.find((r) => r.reason === "judge headCut")?.blockRange).toEqual([0, 5]);
    expect(report.removed.find((r) => r.reason === "judge tailCut")?.blockRange).toEqual([3, 10]);
    expect(chapters).toHaveLength(2);
  });
});
