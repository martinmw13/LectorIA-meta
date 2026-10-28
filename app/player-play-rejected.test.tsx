// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test, vi } from "vitest";
import { Player } from "./player";
import type { Track } from "@/core/music";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("a refused first play() flips the button back to Play", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
    Object.assign(new Error("blocked"), { name: "NotAllowedError" }),
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const track = { id: "t1", src: "/music/t1.m4a", startSec: 0, title: "T1", loop: true } as unknown as Track;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const noop = () => undefined;
  await act(async () => {
    root.render(
      <Player
        track={track}
        replayNonce={0}
        fadeSec={0}
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
  const button = host.querySelector<HTMLButtonElement>("button.play")!;
  await act(async () => {
    button.click();
  });
  expect(button.getAttribute("aria-label")).toBe("Play");
  await act(async () => root.unmount());
});
