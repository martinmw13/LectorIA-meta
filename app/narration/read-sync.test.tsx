// @vitest-environment jsdom
// Click-to-seek: a word click forwards (paragraph, time) to the
// narration controller, which owns the audio element; a drag selection
// never seeks.
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { ChapterNarration } from "@/core/narration";
import { useReadSync } from "./read-sync";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAN: ChapterNarration = {
  format: 2,
  key: "k",
  src: "/narration/k.mp3",
  durationSec: 30,
  voice: "v",
  model: "m",
  speed: 0.95,
  chunks: [
    { n: 1, start: 0, end: 16, t0: 0, t1: 10, w: [0, 16, 0, 10] },
    { n: 3, start: 0, end: 13, t0: 20, t1: 30, w: [0, 13, 20, 30] },
  ],
};

let seeks: [number, number?][] = [];

function Harness({ span }: { span: { startSec: number; endSec: number } }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  useReadSync({
    enabled: true,
    audioRef,
    manifest: MAN,
    span,
    columnRef,
    seekTo: (n, t) => void seeks.push([n, t]),
  });
  return (
    <div>
      <audio ref={audioRef} data-testid="audio" />
      <div ref={columnRef} data-testid="col">
        <p data-n="1">alpha beta gamma</p>
        <p data-n="3">delta zeta eta</p>
      </div>
    </div>
  );
}

function mount(span: { startSec: number; endSec: number }) {
  seeks = [];
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness span={span} />);
  });
  const audio = host.querySelector("[data-testid='audio']") as HTMLAudioElement;
  const writes: number[] = [];
  let t = 0;
  Object.defineProperty(audio, "currentTime", {
    get: () => t,
    set: (v: number) => void (writes.push(v), (t = v)),
    configurable: true,
  });
  return { root, host, writes };
}

function clickWord(host: HTMLElement, n: string, offset: number) {
  const p = host.querySelector(`p[data-n="${n}"]`)!;
  const range = document.createRange();
  range.setStart(p.firstChild!, offset);
  range.collapse(true);
  document.caretRangeFromPoint = (() => range) as Document["caretRangeFromPoint"];
  act(() => {
    host.querySelector("[data-testid='col']")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
  delete (document as unknown as Record<string, unknown>).caretRangeFromPoint;
  vi.unstubAllGlobals();
});

test("clicking a word in a later scene seeks by paragraph and word time", () => {
  const { root, host, writes } = mount({ startSec: 0, endSec: 10 });
  clickWord(host, "3", 2);
  expect(seeks).toEqual([[3, 20.001]]);
  expect(writes).toEqual([]);
  act(() => {
    root.unmount();
  });
});

test("clicking a word in an earlier scene seeks there too", () => {
  const { root, host, writes } = mount({ startSec: 20, endSec: 30 });
  clickWord(host, "1", 7);
  expect(seeks).toEqual([[1, 0.001]]);
  expect(writes).toEqual([]);
  act(() => {
    root.unmount();
  });
});

test("drag-selecting text never seeks", () => {
  const { root, host, writes } = mount({ startSec: 0, endSec: 10 });
  const range = document.createRange();
  range.selectNodeContents(host.querySelector('p[data-n="3"]')!.firstChild!);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  expect(sel.isCollapsed).toBe(false);
  clickWord(host, "3", 2);
  expect(seeks).toEqual([]);
  expect(writes).toEqual([]);
  act(() => {
    root.unmount();
  });
});
