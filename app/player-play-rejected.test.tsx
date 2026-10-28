// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Player } from "./player";
import type { Track } from "@/core/music";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refused = () => Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
const T1 = { id: "t1", src: "/music/t1.m4a", startSec: 0, title: "T1", loop: true } as unknown as Track;
const T2 = { id: "t2", src: "/music/t2.m4a", startSec: 0, title: "T2", loop: true } as unknown as Track;
const noop = () => undefined;
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", noop);
  play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(noop);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount(track: Track) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (t: Track) =>
    act(async () => {
      root.render(
        <Player
          track={t}
          replayNonce={0}
          fadeSec={2}
          canPrev={false}
          onPrev={noop}
          canSkip={false}
          onSkip={noop}
          volume={0.5}
          muted={false}
          onVolumeChange={noop}
          onMutedChange={noop}
          modes={[]}
          current={null}
          onAdvance={noop}
          onEnded={noop}
          playlistOn={false}
        />,
      );
    });
  await render(track);
  const button = host.querySelector<HTMLButtonElement>("button.play")!;
  const click = () => act(async () => button.click());
  return { button, click, render };
}

test("a refused first play() flips the button back to Play", async () => {
  play.mockImplementation(refused);
  const { button, click } = await mount(T1);
  await click();
  expect(button.getAttribute("aria-label")).toBe("Play");
});

test("a refused play() during a crossfade resets to Play and pauses the old track", async () => {
  const { button, click, render } = await mount(T1);
  await click();
  expect(button.getAttribute("aria-label")).toBe("Pause");
  play.mockImplementation(refused);
  pause.mockClear();
  await render(T2);
  expect(button.getAttribute("aria-label")).toBe("Play");
  expect(pause).toHaveBeenCalledTimes(2);
});

test("a refused resume flips the button back to Play", async () => {
  const { button, click } = await mount(T1);
  await click();
  await click();
  expect(button.getAttribute("aria-label")).toBe("Play");
  play.mockImplementation(refused);
  await click();
  expect(button.getAttribute("aria-label")).toBe("Play");
});
