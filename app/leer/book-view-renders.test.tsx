// @vitest-environment jsdom
// Render isolation: narration state (play, volume, duck, word clock)
// re-renders only <ReadAlong>, never BookView and its paragraphs.
// ImagePane renders once per BookView render, so it counts them.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReaderModel } from "@/core/reader";
import { NarrationProvider, useNarration } from "../narration/context";
import type { NarrationController } from "../narration/use-narration";
import { BookView } from "./book-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const counts = vi.hoisted(() => ({ book: 0, probe: 0 }));

vi.mock("../folio/image-pane", () => ({
  ImagePane: () => {
    counts.book += 1;
    return null;
  },
}));
vi.mock("../folio/use-pictures", () => ({
  usePictures: () => ({
    card: { phase: "idle" },
    figures: [],
    popover: null,
    viewRef: () => {},
    popRef: { current: null },
    illustrateScene: () => {},
    illustratePassage: () => {},
    hidePopover: () => {},
    rescan: () => {},
    clearScene: () => {},
    removeFigure: () => {},
    retryFigure: () => {},
    lightbox: { item: null, open: () => {}, close: () => {} },
  }),
}));

const MODEL: ReaderModel = {
  bookId: "b",
  textVersion: "v",
  title: "T",
  author: "A",
  chapters: [
    {
      ch: 1,
      title: "One",
      scenes: [
        {
          id: "c1s1",
          title: "S1",
          paragraphs: [
            { id: "p1", n: 1, text: "One two three." },
            { id: "p2", n: 2, text: "Four five six." },
          ],
        },
      ],
    },
  ],
} as unknown as ReaderModel;
const SCENES = [{ id: "c1s1", ch: 1, startN: 1, endN: 2 }];
const ENTRIES = [{ ch: 1, src: "/narration/k1.mp3", manifest: "/narration/k1.json" }];
const MANIFEST = {
  format: 2,
  key: "k1",
  src: "/narration/k1.mp3",
  durationSec: 6,
  voice: "v",
  model: "m",
  speed: 1,
  chunks: [
    { n: 1, start: 0, end: 14, t0: 0, t1: 3, w: [0, 3, 0, 1, 4, 7, 1, 2, 8, 13, 2, 3] },
    { n: 2, start: 0, end: 14, t0: 3, t1: 6, w: [0, 4, 3, 4, 5, 9, 4, 5, 10, 13, 5, 6] },
  ],
};

let ctl: NarrationController | null = null;
function Probe() {
  ctl = useNarration();
  counts.probe += 1;
  return null;
}

beforeEach(() => {
  counts.book = 0;
  counts.probe = 0;
  localStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(MANIFEST), { headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  ctl = null;
});

test("narration updates never re-render the book", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <NarrationProvider entries={ENTRIES} scenes={SCENES} musicLevel={0.5}>
        <Probe />
        <BookView model={MODEL} initialSceneId="c1s1" panelsByChapter={[]} />
      </NarrationProvider>,
    );
  });
  const audio = host.querySelector("audio")!;
  let t = 0;
  let paused = true;
  Object.defineProperty(audio, "currentTime", { get: () => t, set: (v: number) => void (t = v), configurable: true });
  Object.defineProperty(audio, "paused", { get: () => paused, configurable: true });
  audio.play = (() => {
    paused = false;
    audio.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }) as () => Promise<void>;
  audio.pause = (() => {
    paused = true;
    audio.dispatchEvent(new Event("pause"));
  }) as () => void;

  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(host.querySelector("#p1")).not.toBeNull();
  const bookBefore = counts.book;
  const probeBefore = counts.probe;

  await act(async () => {
    ctl!.toggle();
    await new Promise((r) => setTimeout(r, 0));
  });
  for (const time of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    await act(async () => {
      t = time;
      audio.dispatchEvent(new Event("timeupdate"));
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  for (const v of [0.2, 0.4, 0.6]) {
    await act(async () => {
      ctl!.setVolume(v);
    });
  }

  // The narration context did change many times...
  expect(counts.probe).toBeGreaterThan(probeBefore + 3);
  // ...and the book rendered not once more.
  expect(counts.book).toBe(bookBefore);
});

test("each scene section carries its number and its chapter's scene count, past 30", async () => {
  const scenes = Array.from({ length: 31 }, (_, i) => ({
    id: `c1s${i + 1}`,
    title: `S${i + 1}`,
    paragraphs: [{ id: `q${i + 1}`, n: i + 1, text: "Words." }],
  }));
  const model = { ...MODEL, chapters: [{ ...MODEL.chapters[0], scenes }] } as unknown as ReaderModel;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <NarrationProvider entries={ENTRIES} scenes={SCENES} musicLevel={0.5}>
        <BookView model={model} initialSceneId="c1s1" panelsByChapter={[]} />
      </NarrationProvider>,
    );
  });
  const sections = [...host.querySelectorAll<HTMLElement>(".chapter-block > .book-section")];
  expect(sections).toHaveLength(31);
  expect(sections[1]!.style.getPropertyValue("--scene-n")).toBe('"2"');
  expect(sections[30]!.style.getPropertyValue("--scene-n")).toBe('"31"');
  expect(sections[30]!.style.getPropertyValue("--scene-of")).toBe('" of 31"');
});
