// @vitest-environment jsdom
// Narration controller boundary tests: a chapter's last scene must hand
// over to the next chapter's FIRST scene even when `ended` fires before
// the next manifest lands, and same-chapter advances must not seek.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { setCurrentSceneId } from "../leer/current-scene";
import { pickEffectiveVoice, useNarrationController } from "./use-narration";
import { NARRATION_PREFS_KEY } from "./prefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCENES = [
  { id: "c1s1", ch: 1, startN: 1, endN: 2 },
  { id: "c1s2", ch: 1, startN: 3, endN: 4 },
  { id: "c2s1", ch: 2, startN: 5, endN: 6 },
  { id: "c2s2", ch: 2, startN: 7, endN: 8 },
];
const ENTRIES = [
  { ch: 1, voice: "af_heart", src: "/narration/k1.mp3", manifest: "/narration/k1.json" },
  { ch: 2, voice: "af_heart", src: "/narration/k2.mp3", manifest: "/narration/k2.json" },
];

function chunk(n: number, t0: number, t1: number) {
  return { n, start: 0, end: 5, t0, t1, w: [0, 5, t0, t1] };
}
function manifest(key: string, fromN: number) {
  return {
    format: 2,
    key,
    src: `/narration/${key}.mp3`,
    durationSec: 40,
    voice: "v",
    model: "m",
    speed: 0.95,
    chunks: [0, 1, 2, 3].map((i) => chunk(fromN + i, i * 10, i * 10 + 10)),
  };
}
const MAN1 = manifest("k1", 1);
const MAN2 = manifest("k2", 5);

type Ctl = ReturnType<typeof useNarrationController>;
let ctl: Ctl | null = null;
let harnessEntries = ENTRIES;

function Harness() {
  const c = useNarrationController({ entries: harnessEntries, scenes: SCENES });
  /* eslint-disable-next-line react-hooks/globals -- test probe captures the controller */
  ctl = c;
  /* eslint-disable-next-line react-hooks/refs -- test probe attaches the controller audio ref */
  return <audio ref={c.audioRef} />;
}

function stubAudio(audio: HTMLAudioElement) {
  let paused = true;
  let t = 0;
  const writes: number[] = [];
  Object.defineProperty(audio, "paused", { get: () => paused, configurable: true });
  Object.defineProperty(audio, "currentTime", {
    get: () => t,
    set: (v: number) => {
      writes.push(v);
      t = v;
    },
    configurable: true,
  });
  audio.play = (() => {
    paused = false;
    audio.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }) as () => Promise<void>;
  audio.pause = (() => {
    paused = true;
    audio.dispatchEvent(new Event("pause"));
  }) as () => void;
  return { writes, setTime: (v: number) => void (t = v), time: () => t };
}

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness />);
  });
  const audio = host.querySelector("audio")!;
  return { root, audio, fake: stubAudio(audio) };
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// Chapter 2 answers only when the test releases it.
function holdCh2() {
  let release!: (body: unknown) => void;
  const held = new Promise<unknown>((done) => {
    release = done;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("k2")
        ? held.then((body) => ({ ok: true, json: async () => body }))
        : Promise.resolve({ ok: true, json: async () => MAN1 }),
    ),
  );
  return async (body: unknown) => {
    await act(async () => {
      release(body);
      await held;
      await new Promise((r) => setTimeout(r, 0));
    });
  };
}

beforeEach(() => {
  // The duck ramp never ticks in these tests; only its target matters.
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  setCurrentSceneId(null);
  harnessEntries = ENTRIES;
  vi.unstubAllGlobals();
});

async function playLive(id: string) {
  const m = mount();
  setCurrentSceneId(id);
  act(() => {
    ctl!.toggle();
  });
  await flush();
  act(() => {
    m.audio.dispatchEvent(new Event("loadedmetadata"));
  });
  return m;
}

test("chapter boundary: ended before the next manifest lands keeps the first scene", async () => {
  const answerCh2 = holdCh2();
  const { root, audio, fake } = await playLive("c1s2");
  expect(ctl!.scene?.id).toBe("c1s2");
  expect(ctl!.status).toBe("ready");
  expect(audio.dataset.key).toBe("k1");
  fake.setTime(39.9);
  act(() => {
    audio.dispatchEvent(new Event("timeupdate"));
  });
  expect(ctl!.scene?.id).toBe("c2s1");
  act(() => {
    audio.dispatchEvent(new Event("ended"));
  });
  await answerCh2(MAN2);
  act(() => {
    audio.dispatchEvent(new Event("loadedmetadata"));
  });
  expect(ctl!.scene?.id).toBe("c2s1");
  expect(audio.dataset.key).toBe("k2");
  expect(audio.src).toContain("k2.mp3");
  expect(fake.time()).toBe(0);
  act(() => {
    root.unmount();
  });
});

test("same-chapter advance keeps playing without seeking", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MAN1 })));
  const { root, audio, fake } = await playLive("c1s1");
  fake.setTime(19.9);
  fake.writes.length = 0;
  act(() => {
    audio.dispatchEvent(new Event("timeupdate"));
  });
  expect(ctl!.scene?.id).toBe("c1s2");
  expect(fake.writes).toEqual([]);
  act(() => {
    root.unmount();
  });
});

test("an ended chapter mid-scene resumes at the next span start", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MAN1 })));
  const { root, audio, fake } = await playLive("c1s1");
  fake.setTime(35);
  act(() => {
    audio.pause();
  });
  act(() => {
    audio.dispatchEvent(new Event("ended"));
  });
  expect(ctl!.scene?.id).toBe("c1s2");
  expect(fake.time()).toBe(20);
  expect(ctl!.playing).toBe(true);
  act(() => {
    root.unmount();
  });
});

test("seekTo a later scene sets the scene and the next timeupdate does not jump", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MAN1 })));
  const { root, audio, fake } = await playLive("c1s1");
  fake.setTime(5);
  act(() => {
    ctl!.seekTo(3, 25.001);
  });
  expect(ctl!.scene?.id).toBe("c1s2");
  expect(fake.time()).toBeCloseTo(25.001, 3);
  act(() => {
    audio.dispatchEvent(new Event("timeupdate"));
  });
  expect(ctl!.scene?.id).toBe("c1s2");
  expect(fake.time()).toBeCloseTo(25.001, 3);
  act(() => {
    root.unmount();
  });
});

test("seekTo an earlier scene lands inside its span", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MAN1 })));
  const { root, audio, fake } = await playLive("c1s2");
  fake.setTime(35);
  act(() => {
    ctl!.seekTo(1, 5.001);
  });
  expect(ctl!.scene?.id).toBe("c1s1");
  expect(fake.time()).toBeCloseTo(5.001, 3);
  const span = ctl!.span;
  expect(span).not.toBeNull();
  expect(span!.startSec).toBeLessThanOrEqual(5.001);
  expect(5.001).toBeLessThanOrEqual(span!.endSec);
  act(() => {
    root.unmount();
  });
});

test("switching voice mid-playback restarts the chapter near the same position", async () => {
  const MAN_A = manifest("a1", 1);
  const MAN_B = manifest("b1", 1);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("b1") ? MAN_B : MAN_A),
    })),
  );
  harnessEntries = [
    { ch: 1, voice: "af_heart", src: "/narration/a1.mp3", manifest: "/narration/a1.json" },
    { ch: 1, voice: "bf_emma", src: "/narration/b1.mp3", manifest: "/narration/b1.json" },
  ];
  const { root, audio, fake } = await playLive("c1s1");
  expect(ctl!.voice).toBe("af_heart");
  expect(ctl!.voices).toEqual(["af_heart", "bf_emma"]);
  expect(audio.dataset.key).toBe("a1");
  fake.setTime(12.3);
  act(() => {
    ctl!.setVoice("bf_emma");
  });
  await flush();
  act(() => {
    audio.dispatchEvent(new Event("loadedmetadata"));
  });
  expect(ctl!.voice).toBe("bf_emma");
  expect(audio.dataset.key).toBe("b1");
  expect(audio.src).toContain("b1.mp3");
  expect(fake.time()).toBeCloseTo(12.3, 3);
  expect(ctl!.playing).toBe(true);
  act(() => {
    root.unmount();
  });
});

test("saved voice missing from the chapter falls back without overwriting the pref", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MAN1 })));
  window.localStorage.setItem(
    NARRATION_PREFS_KEY,
    JSON.stringify({ on: false, volume: 0.8, voice: "bf_emma" }),
  );
  const { root, audio } = await playLive("c1s1");
  expect(ctl!.voice).toBe("af_heart");
  expect(ctl!.status).toBe("ready");
  expect(audio.dataset.key).toBe("k1");
  expect(audio.src).toContain("k1.mp3");
  expect(JSON.parse(window.localStorage.getItem(NARRATION_PREFS_KEY)!).voice).toBe("bf_emma");
  act(() => {
    root.unmount();
  });
});

test("pickEffectiveVoice keeps the saved voice only when offered", () => {
  expect(pickEffectiveVoice("bf_emma", ["af_heart", "bf_emma"])).toBe("bf_emma");
  expect(pickEffectiveVoice("bf_emma", ["af_heart"])).toBe("af_heart");
  expect(pickEffectiveVoice("bf_emma", [])).toBe("bf_emma");
});

test("after an audio error the next press reloads the source once, then rests idle", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => MAN1 })));
  const { audio } = await playLive("c1s1");
  act(() => {
    audio.dispatchEvent(new Event("error"));
  });
  expect(ctl!.playing).toBe(false);
  const srcSet = vi.spyOn(audio, "src", "set");
  audio.play = vi.fn(() => Promise.reject(new Error("still broken")));
  act(() => {
    ctl!.toggle();
  });
  await flush();
  expect(srcSet).toHaveBeenCalledTimes(1);
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(ctl!.playing).toBe(false);
});
