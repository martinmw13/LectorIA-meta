import { describe, expect, it, vi } from "vitest";
import { cleanSections } from "./clean";
import type { Judge, JudgeResult, RawSection } from "./clean";
import { cleanGutenbergText } from "./clean-txt";
import { splitChapters, stripGutenberg } from "./gutenberg";
import carol from "./fixtures/clean/se-carol.json";
import pg11 from "./fixtures/clean/pg11.json";
import pg77472 from "./fixtures/clean/pg77472.json";
import pg63361 from "./fixtures/clean/pg63361.json";
import editionLines from "./fixtures/clean/edition-lines.json";

function sectionsOf(fixture: { sections: unknown }): RawSection[] {
  return fixture.sections as unknown as RawSection[];
}

function contentJudge(extra?: Partial<JudgeResult>): Judge {
  return async (input) => ({
    sections: input.sections.map((s) => ({ id: s.id, verdict: "content" as const, kind: "content", reason: "test" })),
    headCut: 0,
    tailCut: 0,
    provider: "meta" as const,
    model: "fake",
    promptTokens: 1,
    completionTokens: 1,
    cachedTokens: 0,
    costUsd: 0,
    fallbackUsed: false,
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

  it("never surfaces the title-page edition line as a chapter", async () => {
    const judge = vi.fn(contentJudge());
    const { chapters } = await cleanSections("Alice’s Adventures in Wonderland", sectionsOf(pg11), judge);
    for (const chapter of chapters) {
      expect(chapter.title).not.toMatch(/MILLENNIUM FULCRUM|EDITION/);
      expect(chapter.paragraphs[0] ?? "").not.toMatch(/MILLENNIUM FULCRUM|EDITION/);
    }
    expect(chapters[0]?.title).toBe("Down the Rabbit-Hole");
  });
});

describe("edition-lines fixture", () => {
  it("removes the edition-notice front section by rule, never the judge", async () => {
    const judge = vi.fn(contentJudge());
    const { chapters, report } = await cleanSections("Edition Lines Test", sectionsOf(editionLines), judge);
    expect(removedRule(report, "front")).toBe("edition-line");
    expect(chapters.map((c) => c.title)).toEqual(["Down the Test Hole", "The Dry Pond"]);
    expect(judge).not.toHaveBeenCalled();
    expect(report.llm).toBeNull();
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
  it("drops CONTENTS by rule, cuts ads after THE END without the LLM", async () => {
    const seen: string[] = [];
    const judge: Judge = async (input) => {
      seen.push(...input.sections.map((s) => s.id));
      return contentJudge()(input);
    };
    const { chapters, report } = await cleanSections("Cottage Folk", sectionsOf(pg63361), judge);
    const h = (n: number): string => `7696831315902964313_63361-h-${n}.htm`;
    expect(removedRule(report, h(1))).toBe("title-policy");
    expect(removedRule(report, h(9))).toBe("tail-cut");
    expect(removedRule(report, h(10))).toBe("tail-cut");
    // h-0: removed by rule or sent to the judge.
    expect(removedRule(report, h(0)) !== null || seen.includes(h(0))).toBe(true);
    // h-2 drops the repeated "THE HOPPERS" plain block after the heading.
    const hoppers = chapters.find((c) => c.title === "THE HOPPERS");
    expect(hoppers?.paragraphs[0]).toBe("The girl didn’t stop.");
    // The tail cut takes the THE END block itself, not just what follows.
    const lastStory = chapters[chapters.length - 1];
    expect(lastStory?.paragraphs).not.toContain("THE END");
    expect(lastStory?.paragraphs.some((p) => /MANXMAN|HEINEMANN/.test(p))).toBe(false);
  });
});

function b(text: string, heading = false): { text: string; heading: boolean } {
  return { text, heading };
}

function inlineSec(
  id: string,
  blocks: { text: string; heading: boolean }[],
  extra?: Partial<RawSection>,
): RawSection {
  return {
    id,
    href: `${id}.htm`,
    linear: true,
    types: [],
    docTitle: null,
    navLabel: null,
    blocks,
    ...extra,
  };
}

describe("pg-markers guard", () => {
  it("keeps a long story chapter that shares its file with the license nav entry", async () => {
    const story = Array.from({ length: 38 }, (_, i) =>
      b(`Story paragraph number ${i} with enough words to push the total well past the guard threshold.`),
    );
    const chapter = inlineSec("h-24", [b("The Riches of Content", true), ...story], {
      docTitle: "The Riches of Content",
      navLabel: "THE FULL PROJECT GUTENBERG LICENSE",
    });
    const license = inlineSec("license", [b("License terms", true), b("Full license text about the license terms.")], {
      docTitle: "THE FULL PROJECT GUTENBERG LICENSE",
      navLabel: "THE FULL PROJECT GUTENBERG LICENSE",
    });
    // A license-flavored nav label alone never removes a titled chapter.
    const titled = inlineSec("ch", [b("A Real Story", true), b("Story prose."), b("More story prose.")], {
      docTitle: "A Real Story",
      navLabel: "LICENSE",
    });
    const { chapters, report } = await cleanSections("Pg54 Book", [chapter, license, titled], contentJudge());
    expect(chapters.map((c) => c.title)).toEqual(["The Riches of Content", "A Real Story"]);
    expect(removedRule(report, "license")).toBe("pg-markers");
    expect(report.removed.filter((r) => r.rule === "pg-markers")).toHaveLength(1);
  });
});

describe("cross-section tail cut", () => {
  it("cuts after THE END mid-book and drops later ad sections", async () => {
    const story = inlineSec(
      "s1",
      [b("CHAPTER I", true), b("Story one."), b("THE END"), b("Buy more books."), b("Printed by Ballantyne.")],
      { docTitle: "CHAPTER I", navLabel: "Chapter 1" },
    );
    const ads = inlineSec("s2", [b("Ad page one."), b("Ad page two.")], { docTitle: "Ads" });
    const { chapters, report } = await cleanSections("Book", [story, ads], contentJudge());
    expect(chapters).toHaveLength(1);
    expect(chapters[0]?.paragraphs).toEqual(["Story one."]);
    expect(removedRule(report, "s2")).toBe("tail-cut");
  });

  it("keeps later sections when one carries a confident chapter heading", async () => {
    const first = inlineSec("s1", [b("CHAPTER I", true), b("Story."), b("THE END"), b("Ad bleed.")]);
    const next = inlineSec("s2", [b("CHAPTER II", true), b("Next story.")]);
    const { chapters, report } = await cleanSections("Book", [first, next], contentJudge());
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.paragraphs).toEqual(["Story."]);
    expect(chapters[1]?.paragraphs).toEqual(["Next story."]);
    expect(report.removed.filter((r) => r.sectionId === "s2")).toHaveLength(0);
  });
});

describe("contents cross-reference", () => {
  it("drops a list of other sections' titles, keeps shorter matches", async () => {
    const story = (id: string, title: string): RawSection =>
      inlineSec(id, [b(title, true), b(`Prose of the ${title} chapter keeps going here.`)], { docTitle: title });
    const contents = inlineSec("toc", [b("Alpha"), b("Beta"), b("Gamma"), b("Delta.")], { docTitle: "Front" });
    const mention = inlineSec("mention", [b("Alpha"), b("Beta"), b("Unrelated prose about the weather today.")], {
      docTitle: "Mention",
    });
    const { chapters, report } = await cleanSections(
      "Book",
      [contents, story("a", "Alpha"), story("b", "Beta"), story("c", "Gamma"), story("d", "Delta"), mention],
      contentJudge(),
    );
    expect(removedRule(report, "toc")).toBe("contents-body");
    expect(chapters.map((c) => c.title)).toContain("Mention");
  });
});

describe("block-drop placeholders", () => {
  it("drops image placeholder blocks and illustration lines", async () => {
    const ch = inlineSec("ch", [
      b("CHAPTER I", true),
      b("Story text."),
      b("Image 12"),
      b("fig 3a"),
      b("IMG-4"),
      b("[Illustration: a house]"),
      b("More story."),
    ]);
    const { chapters } = await cleanSections("Book", [ch], contentJudge());
    expect(chapters[0]?.paragraphs).toEqual(["Story text.", "More story."]);
  });

  it("drops a repeated chapter title after the heading, only in the first two blocks", async () => {
    const dup = inlineSec("dup", [b("THE HOPPERS", true), b("THE HOPPERS"), b("The girl didn’t stop.")], {
      docTitle: "THE HOPPERS",
    });
    const late = inlineSec("late", [b("TALES", true), b("Prose first."), b("Tales")], { docTitle: "TALES" });
    const { chapters } = await cleanSections("Book", [dup, late], contentJudge());
    expect(chapters.find((c) => c.title === "THE HOPPERS")?.paragraphs).toEqual(["The girl didn’t stop."]);
    expect(chapters.find((c) => c.title === "TALES")?.paragraphs).toEqual(["Prose first.", "Tales"]);
  });
});

describe("plain prose parity", () => {
  it("leaves an all-prose section byte-identical through tail and title-duplicate rules", async () => {
    const prose = [
      "Dorothy lived in the midst of the great Kansas prairies.",
      "The end of the journey was nowhere in sight.",
      "Tales of the road kept them walking.",
      "Tales of the road kept them walking.",
      "The Cyclone",
    ];
    const sec = inlineSec(
      "oz-like",
      prose.map((text) => b(text)),
      { docTitle: "The Cyclone" },
    );
    const judge = vi.fn(contentJudge());
    const { chapters, report } = await cleanSections("Oz", [sec], judge);
    // No heading means no duplicate-title drop and no exact END mark:
    // the tail cut and rule 11 leave plain prose alone, like Oz.
    expect(chapters[0]?.paragraphs).toEqual(prose);
    expect(report.removed.filter((r) => r.sectionId === "oz-like")).toHaveLength(0);
  });
});

describe("judge cut overlap", () => {
  it("skips judge tailCut covered by deterministic tail rules", async () => {
    const story = inlineSec("s1", [b("CHAPTER I", true), b("Story one."), b("THE END"), b("Buy more books.")]);
    const ads = inlineSec("s2", [b("Ad page one."), b("Ad page two.")]);
    const judge: Judge = async (input) => {
      const base = await contentJudge()(input);
      if (base === null) throw new Error("test judge failed");
      base.tailCut = 2;
      return base;
    };
    const { chapters, report } = await cleanSections("Book", [story, ads], judge);
    expect(report.removed.filter((r) => r.rule === "llm")).toHaveLength(0);
    expect(removedRule(report, "s2")).toBe("tail-cut");
    expect(chapters[0]?.paragraphs).toEqual(["Story one."]);
  });

  it("clips judge tailCut to blocks deterministic rules keep", async () => {
    const ch = inlineSec("ch", [b("Story one."), b("Story two."), b("Printed by X.")], { docTitle: "Story" });
    const judge: Judge = async (input) => {
      const base = await contentJudge()(input);
      if (base === null) throw new Error("test judge failed");
      base.tailCut = 2;
      return base;
    };
    const { chapters, report } = await cleanSections("Book", [ch], judge);
    const edge = report.removed.find((r) => r.rule === "llm");
    expect(edge?.blockRange).toEqual([1, 1]);
    expect(removedRule(report, "ch")).toBe("llm");
    expect(chapters[0]?.paragraphs).toEqual(["Story one."]);
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
