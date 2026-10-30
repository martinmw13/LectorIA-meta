// @vitest-environment jsdom
// Per-UTC-day free-book hint: counts up, rolls over at midnight UTC,
// and treats bad JSON or blocked storage as zero.
import { beforeEach, describe, expect, test } from "vitest";
import { countFreeBookToday, getFreeBooksToday, utcDay } from "./free-book";

const KEY = "lectoria.freeBooks.v2";
const NOON = new Date("2026-10-30T12:00:00.000Z");

beforeEach(() => {
  window.localStorage.clear();
});

describe("free-book hint", () => {
  test("starts at zero and counts up within the day", () => {
    expect(getFreeBooksToday(NOON)).toBe(0);
    countFreeBookToday(NOON);
    countFreeBookToday(NOON);
    expect(getFreeBooksToday(NOON)).toBe(2);
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify({ day: "2026-10-30", count: 2 }));
  });

  test("resets on a new UTC day", () => {
    countFreeBookToday(NOON);
    countFreeBookToday(NOON);
    expect(getFreeBooksToday(new Date("2026-10-31T00:00:01.000Z"))).toBe(0);
    countFreeBookToday(new Date("2026-10-31T00:00:01.000Z"));
    expect(getFreeBooksToday(new Date("2026-10-31T00:00:01.000Z"))).toBe(1);
  });

  test("bad JSON and wrong shapes read as zero", () => {
    for (const raw of ["{oops", "[1,2]", '"x"', "3", "null"]) {
      window.localStorage.setItem(KEY, raw);
      expect(getFreeBooksToday(NOON)).toBe(0);
    }
    window.localStorage.setItem(KEY, JSON.stringify({ day: "2026-10-30", count: -1 }));
    expect(getFreeBooksToday(NOON)).toBe(0);
    window.localStorage.setItem(KEY, JSON.stringify({ day: "2026-10-30", count: 1.5 }));
    expect(getFreeBooksToday(NOON)).toBe(0);
    window.localStorage.setItem(KEY, JSON.stringify({ day: "2026-10-30" }));
    expect(getFreeBooksToday(NOON)).toBe(0);
  });

  test("utcDay slices the ISO date", () => {
    expect(utcDay(NOON)).toBe("2026-10-30");
  });
});
