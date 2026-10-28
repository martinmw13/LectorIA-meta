import { describe, expect, it } from "vitest";
import { CHAT_MAX_QUESTION_CHARS } from "@/core/chat";
import book from "../../data/books/oz/book.json";
import scenes from "../../data/books/oz/scenes.json";
import data from "../../data/books/oz/chat-suggestions.json";

interface Entry {
  ch: number;
  questions: string[];
  sources: number[];
}

// Spoiler safety: every answer paragraph sits before the chapter starts, so
// a reader at the chapter's first scene already has it. Chapter 1 has no
// earlier text, so its answers sit inside its first scene.
describe("chat suggestions data", () => {
  const entries = data.chapters as Entry[];

  it("has three short questions for every chapter", () => {
    expect(entries.map((e) => e.ch)).toEqual(book.chapters.map((c) => c.ch));
    for (const e of entries) {
      expect(e.questions).toHaveLength(3);
      expect(e.sources).toHaveLength(3);
      for (const q of e.questions) {
        expect(q.trim()).not.toBe("");
        expect(q.length).toBeLessThanOrEqual(CHAT_MAX_QUESTION_CHARS);
      }
    }
  });

  it("answers every question from text the reader has already passed", () => {
    for (const e of entries) {
      const chapter = book.chapters.find((c) => c.ch === e.ch)!;
      const first = scenes.scenes.find((s) => s.ch === e.ch)!;
      const limit = e.ch === 1 ? first.end_n : chapter.start_n - 1;
      for (const n of e.sources) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(limit);
      }
    }
  });
});
