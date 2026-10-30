import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BookMap } from "@/core/bookmap";
import { chapterReference, getBookmap, matchCharacterIds, passageReference } from "./bookmap-prompt";

function char(id: string, name: string, aliases: string[], physical_description: string, first_ch: number | null) {
  return { id, name, aliases, physical_description, first_ch };
}

const CHARACTERS = [
  char("dorothy", "Dorothy", [], "Girl in a gingham dress.", 1),
  char("aunt-em", "Aunt Em", ["Em"], "Thin woman in farm clothes.", 1),
  char("wicked-witch-of-the-west", "Wicked Witch of the West", ["Witch of the West", "Wicked Witch", "Witch"], "Old woman with one eye.", 12),
  char("witch", "Witch", [], "Some other witch.", 2),
  char("soldier", "Soldier with Green Whiskers", ["soldier"], "Man with a green beard.", 9),
  char("late-friend", "Late Friend", [], "Shows up later.", 9),
  char("no-look", "No Look", [], "", 1),
];

function bookmap(): BookMap {
  return {
    bookId: "oz",
    textVersion: "t",
    setting: { time_period: "Late 19th century", world: "Kansas and Oz", description: "d" },
    characters: CHARACTERS,
    chapters: [{ ch: 1, title: "The Cyclone", summary: "s", cover_description: "House in a cyclone." }],
    scenes: {
      c1s1: {
        setting: { location: "Kansas farmhouse", time_of_day: "daytime", weather: "clear" },
        characters_present: ["dorothy", "aunt-em"],
        key_objects: ["trap door", "cookstove", "silver shoes", "yellow brick"],
      },
      c1s2: {
        setting: { location: "prairie", time_of_day: "", weather: "" },
        characters_present: ["dorothy", "late-friend"],
        key_objects: [],
      },
    },
    provenance: {
      date: "d",
      model: "m",
      input: "i",
      requests: 0,
      prompt_tokens: 0,
      cached_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      estimated_usd: 0,
    },
  };
}

describe("matchCharacterIds", () => {
  it("ignores Em inside them", () => {
    expect(matchCharacterIds("she handed them the pail", CHARACTERS)).toEqual([]);
    expect(matchCharacterIds("Em called from the cellar", CHARACTERS)).toEqual(["aunt-em"]);
  });

  it("matches possessives", () => {
    expect(matchCharacterIds("Dorothy's dog ran ahead", CHARACTERS)).toEqual(["dorothy"]);
  });

  it("lets the longest alias win the span", () => {
    expect(matchCharacterIds("the Wicked Witch of the West cackled", CHARACTERS)).toEqual([
      "wicked-witch-of-the-west",
    ]);
  });

  it("matches capitalized names case-sensitively and lowercase ones loosely", () => {
    expect(matchCharacterIds("dorothy walked on", CHARACTERS)).toEqual([]);
    expect(matchCharacterIds("The Soldier bowed low", CHARACTERS)).toEqual(["soldier"]);
  });
});

describe("passageReference", () => {
  it("returns empty for a null bookmap", () => {
    expect(passageReference({ bookmap: null, sceneIds: ["c1s1"], selectedText: "Dorothy ran", ch: 1 })).toBe("");
  });

  it("injects matched characters, setting, world, and named objects", () => {
    const ref = passageReference({
      bookmap: bookmap(),
      sceneIds: ["c1s1"],
      selectedText: "Dorothy lifted the trap door of the cookstove room",
      ch: 1,
    });
    expect(ref).toContain("Reference details:");
    expect(ref).toContain("Characters (keep consistent): Dorothy: Girl in a gingham dress.");
    expect(ref).toContain("Setting: Kansas farmhouse, daytime, clear.");
    expect(ref).toContain("World: Late 19th century, Kansas and Oz.");
    expect(ref).toContain("Objects: trap door, cookstove.");
    expect(ref).not.toContain("silver shoes");
    expect(ref.length).toBeLessThanOrEqual(900);
  });

  it("falls back to the scene cast when nothing matches", () => {
    const ref = passageReference({ bookmap: bookmap(), sceneIds: ["c1s1"], selectedText: "the wind howled", ch: 1 });
    expect(ref).toContain("Dorothy: Girl in a gingham dress.");
    expect(ref).toContain("Aunt Em: Thin woman in farm clothes.");
  });

  it("hides characters the reader has not met yet", () => {
    const ref = passageReference({
      bookmap: bookmap(),
      sceneIds: ["c1s1"],
      selectedText: "Dorothy met the Witch and her Late Friend",
      ch: 1,
    });
    expect(ref).toContain("Dorothy:");
    expect(ref).not.toContain("Witch:");
    expect(ref).not.toContain("Late Friend");
  });

  it("hides not-yet-met fallback characters too", () => {
    const ref = passageReference({ bookmap: bookmap(), sceneIds: ["c1s2"], selectedText: "the wind howled", ch: 1 });
    expect(ref).toContain("Dorothy:");
    expect(ref).not.toContain("Late Friend");
  });

  it("caps characters at four", () => {
    const many = bookmap();
    many.characters = [
      ...CHARACTERS,
      char("e1", "E1", [], "d1.", 1),
      char("e2", "E2", [], "d2.", 1),
      char("e3", "E3", [], "d3.", 1),
    ];
    const ref = passageReference({
      bookmap: many,
      sceneIds: ["c1s1"],
      selectedText: "Dorothy and Em and E1 and E2 and E3 walked on",
      ch: 1,
    });
    expect(ref).toContain("E2:");
    expect(ref).not.toContain("E3:");
  });

  it("strips newlines from values", () => {
    const dirty = bookmap();
    dirty.characters = [char("dorothy", "Dorothy", [], "Girl\nin a\ngingham dress.", 1)];
    const ref = passageReference({ bookmap: dirty, sceneIds: ["c1s1"], selectedText: "Dorothy ran", ch: 1 });
    expect(ref).not.toContain("\n");
    expect(ref).toContain("Girl in a gingham dress.");
  });

  it("never doubles a period when a clipped value already ends in one", () => {
    const ref = passageReference({
      bookmap: bookmap(),
      sceneIds: ["c1s1"],
      selectedText: "Dorothy lifted the trap door",
      ch: 1,
    });
    expect(ref).toContain("Dorothy: Girl in a gingham dress.");
    expect(ref).not.toContain("..");
  });
});

describe("chapterReference", () => {
  it("returns empty for a null bookmap", () => {
    expect(chapterReference({ bookmap: null, sceneIds: ["c1s1"], ch: 1 })).toBe("");
  });

  it("injects the chapter cast, places, and cover hint", () => {
    const ref = chapterReference({ bookmap: bookmap(), sceneIds: ["c1s1", "c1s2"], ch: 1 });
    expect(ref).toContain("Reference details:");
    expect(ref).toContain("Dorothy: Girl in a gingham dress.");
    expect(ref).toContain("Aunt Em: Thin woman in farm clothes.");
    expect(ref).not.toContain("Late Friend");
    expect(ref).toContain("Places: Kansas farmhouse; prairie.");
    expect(ref).toContain("Key panel: House in a cyclone.");
    expect(ref.length).toBeLessThanOrEqual(900);
  });

  it("caps the cast at six", () => {
    const many = bookmap();
    const extra = ["A", "B", "C", "D", "E", "F", "G"].map((n) => char(n.toLowerCase(), n, [], `${n} look.`, 1));
    many.characters = [...CHARACTERS, ...extra];
    many.scenes.c1s1 = {
      setting: { location: "here", time_of_day: "", weather: "" },
      characters_present: ["dorothy", "a", "b", "c", "d", "e", "f", "g"],
      key_objects: [],
    };
    const ref = chapterReference({ bookmap: many, sceneIds: ["c1s1"], ch: 1 });
    expect(ref).toContain("E: E look.");
    expect(ref).not.toContain("F: F look.");
  });

  it("clips the cover hint without doubling its period", () => {
    const ref = chapterReference({ bookmap: bookmap(), sceneIds: ["c1s1", "c1s2"], ch: 1 });
    expect(ref).toContain("Key panel: House in a cyclone.");
    expect(ref).not.toContain("..");
  });
});

describe("getBookmap", () => {
  it("loads, caches, and tolerates a stale file", () => {
    const root = mkdtempSync(join(tmpdir(), "bookmap-"));
    mkdirSync(join(root, "oz"), { recursive: true });
    writeFileSync(join(root, "oz", "bookmap.json"), JSON.stringify(bookmap()));
    expect(getBookmap("oz", "t", "i", root)?.bookId).toBe("oz");
    expect(getBookmap("oz", "t", "i", root)).toBe(getBookmap("oz", "t", "i", root));
    expect(getBookmap("oz", "other", "i", root)).toBeNull();
    expect(getBookmap("oz", "t", "stale", root)).toBeNull();
    expect(getBookmap("missing", "t", "i", root)).toBeNull();
  });

  it("loads another book's bookmap by id for its reference block", () => {
    const root = mkdtempSync(join(tmpdir(), "bookmap-"));
    mkdirSync(join(root, "alice"), { recursive: true });
    const alice = bookmap();
    alice.bookId = "alice";
    alice.characters = [char("alice", "Alice", [], "Curious girl with long arms.", 1)];
    alice.scenes = {
      c1s1: {
        setting: { location: "rabbit hole", time_of_day: "", weather: "" },
        characters_present: ["alice"],
        key_objects: [],
      },
    };
    writeFileSync(join(root, "alice", "bookmap.json"), JSON.stringify(alice));
    const loaded = getBookmap("alice", "t", "i", root);
    expect(loaded?.bookId).toBe("alice");
    const ref = passageReference({
      bookmap: loaded,
      sceneIds: ["c1s1"],
      selectedText: "Alice fell down",
      ch: 1,
    });
    expect(ref).toContain("Alice: Curious girl with long arms.");
    expect(ref).not.toContain("..");
  });
});

describe("clipWords", () => {
  it("cuts at a word boundary", async () => {
    const { clipWords } = await import("./bookmap-prompt");
    expect(clipWords("old worn leather shoes", 15)).toBe("old worn");
    expect(clipWords("short", 15)).toBe("short");
  });
});
