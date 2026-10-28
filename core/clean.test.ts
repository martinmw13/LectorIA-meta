import { describe, expect, it, vi } from "vitest";
import { cleanSections } from "./clean";
import type { Judge, JudgeResult, RawSection } from "./clean";
import { cleanGutenbergText } from "./clean-txt";
import { splitChapters, stripGutenberg } from "./gutenberg";
import carol from "./fixtures/clean/se-carol.json";
import pg11 from "./fixtures/clean/pg11.json";
import pg77472 from "./fixtures/clean/pg77472.json";
import pg63361 from "./fixtures/clean/pg63361.json";

function sectionsOf(fixture: { sections: unknown }): RawSection[] {
  return fixture.sections as unknown as RawSection[];
}

function contentJudge(extra?: Partial<JudgeResult>): Judge {
  return async (input) => ({
    sections: input.sections.map((s) => ({ id: s.id, verdict: "content" as const, kind: "content", reason: "test" })),
    headCut: 0,
    tailCut: 0,
    model: "fake",
    promptTokens: 1,
    completionTokens: 1,
    cachedTokens: 0,
    costUsd: 0,
    ...extra,
  });
}

function removedRule(report: { removed: { sectionId: string; rule: string }[] }, id: string): string | null {
  return report.removed.find((r) => r.sectionId === id)?.rule ?? null;
}

describe("se-carol", () => {
  it("keeps only the 5 staves with nav-label titles, no LLM", async () => {
    const judge = vi.fn(contentJudge());
    const { chapters, report } = await cleanSections("A Christmas Carol", sectionsOf(carol), judge);
    expect(chapters.map((c) => c.title)).toEqual([
      "Marley’s Ghost",
      "The First of the Three Spirits",
      "The Second of the Three Spirits",
      "The Last of the Spirits",
      "The End of It",
    ]);
    expect(judge).not.toHaveBeenCalled();
    expect(report.llm).toBeNull();
    for (const id of ["titlepage", "imprint", "preface", "halftitlepage", "colophon", "uncopyright"]) {
      expect(removedRule(report, id)).toBe("epub-type");
    }
    expect(report.kept).toHaveLength(5);
  });
});

describe("pg11 Alice", () => {
  it("keeps 12 chapters with stripped labels, cuts THE END, no LLM", async () => {
    const judge = vi.fn(contentJudge());
    const { chapters, report } = await cleanSections("Alice’s Adventures in Wonderland", sectionsOf(pg11), judge);
    expect(chapters).toHaveLength(12);
    expect(chapters[0]?.title).toBe("Down the Rabbit-Hole");
    expect(chapters[11]?.title).toBe("Alice’s Evidence");
    expect(chapters.every((c) => !c.title.startsWith("CHAPTER"))).toBe(true);
    expect(chapters[11]?.paragraphs).not.toContain("THE END");
    expect(judge).not.toHaveBeenCalled();
    expect(report.llm).toBeNull();
    expect(report.kept).toHaveLength(12);
  });
});

describe("pg77472 Pan's Garden", () => {
  it("merges continuations, cuts the printer line, drops junk by rule", async () => {
    const seen: string[][] = [];
    const judge: Judge = async (input) => {
      seen.push(input.sections.map((s) => s.id));
      return contentJudge()(input);
    };
    const { chapters, report } = await cleanSections("Pan's garden", sectionsOf(pg77472), judge);
    const mergedFrom = report.merged.map((m) => m.from);
    const h = (n: number): string => `3997782704835596284_77472-h-${n}.htm`;
    expect(mergedFrom).toContain(h(8));
    expect(mergedFrom).toContain(h(17));
    expect(mergedFrom).toContain(h(24));
    expect(report.merged.filter((m) => m.from === h(24))[0]?.into).toBe(h(23));
    // h-26 folds into h-25 and dies by ad-body with it; h-27/h-28/h-29/h-31
    // die by ad-body on their own; h-30 (Hardy ads, one price token) is not
    // caught and must reach the judge.
    expect(removedRule(report, h(25))).toBe("ad-body");
    const judgeIds = seen[0] ?? [];
    expect(mergedFrom).toContain(h(26));
    for (const n of [27, 28, 29, 31]) expect(removedRule(report, h(n))).toBe("ad-body");
    expect(judgeIds).toContain(h(30));
    for (const n of [5, 6, 32]) {
      expect(["title-policy", "contents-body"]).toContain(removedRule(report, h(n)));
    }
    expect(removedRule(report, h(6))).toBe("title-policy");
    for (const n of [25, 26, 27, 28, 29, 31]) expect(judgeIds).not.toContain(h(n));
    // "Sussex." belongs to the story; the printer line is cut. h-30 survives
    // the all-content fake as the 16th chapter; a real judge drops it.
    const last = chapters[chapters.length - 2];
    expect(last?.paragraphs).toContain("Sussex.");
    expect(last?.paragraphs.some((p) => /R\. & R\. Clark/.test(p))).toBe(false);
    expect(chapters.map((c) => c.title)).toContain("THE TEMPTATION OF THE CLAY");
    expect(chapters).toHaveLength(16);
  });
});

describe("pg63361 Cottage Folk", () => {
  it("drops CONTENTS by rule, cuts ads after THE END, h-10 by judge", async () => {
    const seen: string[] = [];
    const judge: Judge = async (input) => {
      seen.push(...input.sections.map((s) => s.id));
      return {
        sections: input.sections.map((s) => ({
          id: s.id,
          verdict: s.id.endsWith("h-10.htm") ? ("non_content" as const) : ("content" as const),
          kind: s.id.endsWith("h-10.htm") ? "advertisement" : "content",
          reason: "test",
        })),
        headCut: 0,
        tailCut: 0,
        model: "fake",
        promptTokens: 1,
        completionTokens: 1,
        cachedTokens: 0,
        costUsd: 0,
      };
    };
    const { chapters, report } = await cleanSections("Cottage Folk", sectionsOf(pg63361), judge);
    const h = (n: number): string => `7696831315902964313_63361-h-${n}.htm`;
    expect(removedRule(report, h(1))).toBe("title-policy");
    expect(removedRule(report, h(10))).toBe("llm");
    // h-0: removed by rule or sent to the judge.
    expect(removedRule(report, h(0)) !== null || seen.includes(h(0))).toBe(true);
    const lastStory = chapters[chapters.length - 1];
    expect(lastStory?.paragraphs[lastStory.paragraphs.length - 1]).toBe("THE END");
    expect(lastStory?.paragraphs.some((p) => /MANXMAN|HEINEMANN/.test(p))).toBe(false);
  });
});

describe("txt parity", () => {
  it("cleanGutenbergText matches splitChapters exactly", () => {
    const raw = [
      "Title: Oz",
      "",
      "*** START OF THE PROJECT GUTENBERG EBOOK OZ ***",
      "",
      "Introduction",
      "",
      "Some intro text.",
      "",
      "Chapter I",
      "The Cyclone",
      "",
      "Dorothy lived in Kansas.",
      "",
      "Chapter II",
      "The Council",
      "",
      "The Munchkins gathered round.",
      "",
      "*** END OF THE PROJECT GUTENBERG EBOOK OZ ***",
      "",
      "License text here.",
    ].join("\n");
    const { chapters, report } = cleanGutenbergText(raw);
    expect(chapters.map(({ title, paragraphs }) => ({ title, paragraphs }))).toEqual(splitChapters(stripGutenberg(raw)));
    expect(report.source).toBe("gutenberg-txt");
    expect(report.llm).toBeNull();
    expect(report.removed.map((r) => r.rule).sort()).toEqual(["before-first-chapter", "pg-markers", "pg-markers"]);
    expect(report.kept.map((k) => k.title)).toEqual(["The Cyclone", "The Council"]);
  });
});
