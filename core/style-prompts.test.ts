import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPrompt } from "./images";
import type { ImageStyle } from "./image-style";
import { parseStyleChoice } from "./image-style";
import type { StyleBook } from "./image-style";
import { buildChapterPrompt } from "./panels";
import { STYLE_PROMPTS } from "./style-prompts";
import type { StylePromptId } from "./style-prompts";
import { CHAPTER_PROMPT_VERSION, PROMPT_VERSION } from "./types";

const oz: StyleBook = { id: "oz", title: "The Wonderful Wizard of Oz", author: "L. Frank Baum" };
const alice: StyleBook = {
  id: "alice",
  title: "Alice's Adventures in Wonderland",
  author: "Lewis Carroll",
};

const panels = [
  { description: "Dorothy runs to the cellar as the storm comes." },
  { description: "The house lifts into the sky." },
];
const reference =
  "Reference details: Dorothy: a girl in a blue-and-white checked gingham dress, a pink sunbonnet.";

function styles(): (ImageStyle | undefined)[] {
  const presets = (Object.keys(STYLE_PROMPTS) as StylePromptId[]).map(
    (id): ImageStyle => ({ kind: "preset", id }),
  );
  return [
    undefined,
    ...presets,
    { kind: "preset", id: "oil" },
    { kind: "custom", text: "crayon drawing" },
  ];
}

function allPrompts(): string[] {
  const out: string[] = [];
  for (const book of [oz, alice]) {
    for (const style of styles()) {
      out.push(
        buildChapterPrompt({ chapterTitle: "The Cyclone", panels, style, book, reference }),
        buildPrompt({
          kind: "scene",
          passageText: "",
          sceneTitle: "The Cyclone",
          sceneClip: "Gray prairie and a small house.",
          style,
          book,
          reference,
        }),
        buildPrompt({
          kind: "passage",
          passageText: "Dorothy ran outside.",
          sceneTitle: "The Cyclone",
          sceneClip: "Gray prairie and a small house.",
          style,
          book,
          reference,
        }),
      );
    }
  }
  return out;
}

describe("style prompts", () => {
  it("ties prompt text to the key version", () => {
    const canonical = `${JSON.stringify(STYLE_PROMPTS)}\n${allPrompts().join("\n")}`;
    const sha256 = createHash("sha256").update(canonical).digest("hex");
    // If this fails you changed prompt text: bump PROMPT_VERSION (scene/passage)
    // and/or CHAPTER_PROMPT_VERSION (chapter pages), then update the hash.
    expect({ promptVersion: PROMPT_VERSION, chapterPromptVersion: CHAPTER_PROMPT_VERSION, sha256 }).toEqual({
      promptVersion: "v5",
      chapterPromptVersion: "c5",
      sha256: "b039203be33f2e744d3e55b3b6548b8cb141ccc543eaec0e8187337072e139ec",
    });
  });

  it("starts the Oz default chapter prompt with Denslow and puts the reference before the reminder", () => {
    const prompt = buildChapterPrompt({ chapterTitle: "The Cyclone", panels, reference });
    expect(prompt.startsWith("STYLE: In the style of W. W. Denslow")).toBe(true);
    expect(prompt).toContain("silver shoes");
    expect(prompt).toContain("no purple");
    expect(prompt.indexOf("Reference details:")).toBeLessThan(prompt.indexOf("STYLE REMINDER:"));
  });

  it("strips color words from the reference only for monochrome styles", () => {
    const graphite = buildPrompt({
      kind: "scene",
      passageText: "",
      sceneTitle: "The Cyclone",
      sceneClip: "Gray prairie.",
      style: { kind: "preset", id: "graphite" },
      reference,
    });
    expect(graphite).not.toContain("blue");
    expect(graphite).not.toContain("pink");
    const comic = buildPrompt({
      kind: "scene",
      passageText: "",
      sceneTitle: "The Cyclone",
      sceneClip: "Gray prairie.",
      style: { kind: "preset", id: "comic" },
      reference,
    });
    expect(comic).toContain("blue-and-white checked");
    expect(comic).toContain("pink");
  });

  it("keeps non-Oz structured prompts free of Oz guards", () => {
    const prompt = buildChapterPrompt({
      chapterTitle: "Down the Rabbit-Hole",
      panels: [
        { description: "Alice chases the rabbit down the hole." },
        { description: "She lands in a long hallway." },
      ],
      style: { kind: "preset", id: "comic" },
      book: alice,
    });
    expect(prompt).not.toContain("Dorothy");
    expect(prompt).not.toContain("MGM");
    expect(prompt).toContain("Faithful to the text and period of");
  });

  it("keeps the non-Oz default on the legacy generic line", () => {
    const prompt = buildPrompt({
      kind: "scene",
      passageText: "",
      sceneTitle: "Down the Rabbit-Hole",
      sceneClip: "A long hallway.",
      book: alice,
    });
    expect(prompt).toContain("Classic book illustration for Alice's Adventures in Wonderland");
    expect(prompt).not.toContain("Denslow");
  });

  it("never emits double periods or double spaces", () => {
    for (const prompt of allPrompts()) {
      expect(prompt).not.toContain("..");
      expect(prompt).not.toContain("  ");
    }
    const dotted = buildChapterPrompt({
      chapterTitle: "T.",
      panels: [{ description: "She ran home." }, { description: "It rained!" }],
    });
    expect(dotted).not.toContain("..");
    expect(dotted).not.toContain("  ");
  });

  it("keeps each preset's distinct palette line", () => {
    const dusk = buildPrompt({
      kind: "scene",
      passageText: "",
      sceneTitle: "T",
      sceneClip: "Gray prairie.",
      style: { kind: "preset", id: "lantern-dusk" },
    });
    expect(dusk).toContain("gray in the story does not mean a gray palette");
    const comic = buildPrompt({
      kind: "scene",
      passageText: "",
      sceneTitle: "T",
      sceneClip: "Gray prairie.",
      style: { kind: "preset", id: "comic" },
    });
    expect(comic).toContain("still printed in bold saturated comic colors");
  });

  it("still rejects named references in user custom text", () => {
    for (const custom of ["marvel heroes", "ghibli mood", "big studio look", "in the style of ink"]) {
      expect(() => parseStyleChoice({ custom })).toThrow();
    }
  });
});
