import { describe, expect, it } from "vitest";
import { AmbienceController } from "./ambience-controller";
import type { AmbienceEngine, AmbienceVoice } from "./ambience-controller";
import type { AmbienceSource } from "@/core/ambience";

interface FakeVoice extends AmbienceVoice {
  ramps: Array<[number, number]>;
  stops: number[];
}

interface PendingLoad {
  sources: AmbienceSource[];
  resolve: (handle: unknown) => void;
}

function fakeEngine() {
  const loads: PendingLoad[] = [];
  const starts: Array<{ handle: unknown; gain: number; fadeSec: number; voice: FakeVoice }> = [];
  let unlocks = 0;
  const engine: AmbienceEngine = {
    load: (sources) => new Promise((resolve) => void loads.push({ sources, resolve })),
    start: (handle, gain, fadeSec) => {
      const voice: FakeVoice = {
        ramps: [],
        stops: [],
        ramp: (g, s) => void voice.ramps.push([g, s]),
        stop: (s) => void voice.stops.push(s),
      };
      starts.push({ handle, gain, fadeSec, voice });
      return voice;
    },
    unlock: () => {
      unlocks += 1;
      return Promise.resolve();
    },
  };
  return { engine, loads, starts, unlocks: () => unlocks };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function unlockedLevel(loads: PendingLoad[], id: string) {
  const load = loads.find((pending) => pending.sources[0]?.src.includes(id));
  load!.resolve(`handle-${id}`);
  await tick();
}

describe("ambience controller", () => {
  it("stays silent while locked and fades in on the first unlock", async () => {
    const { engine, loads, starts } = fakeEngine();
    const controller = new AmbienceController(engine);
    controller.setLevel("drizzle");
    await tick();
    expect(loads).toHaveLength(0);
    expect(starts).toHaveLength(0);
    await controller.unlock();
    expect(loads).toHaveLength(1);
    expect(starts).toHaveLength(0);
    await unlockedLevel(loads, "drizzle");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ handle: "handle-drizzle", gain: 0.4, fadeSec: 1.5 });
  });

  it("cycles drizzle to moderate to storm with crossfades, then fades out", async () => {
    const { engine, loads, starts } = fakeEngine();
    const controller = new AmbienceController(engine);
    await controller.unlock();
    controller.setLevel("drizzle");
    await unlockedLevel(loads, "drizzle");
    controller.setLevel("moderate");
    await unlockedLevel(loads, "moderate");
    expect(starts).toHaveLength(2);
    expect(starts[0]!.voice.stops).toEqual([2]);
    expect(starts[1]).toMatchObject({ gain: 0.4, fadeSec: 2 });
    controller.setLevel("storm");
    await unlockedLevel(loads, "storm");
    expect(starts).toHaveLength(3);
    expect(starts[1]!.voice.stops).toEqual([2]);
    controller.setLevel("off");
    await tick();
    expect(starts).toHaveLength(3);
    expect(starts[2]!.voice.stops).toEqual([1.2]);
  });

  it("mutes with a short fade and unmutes back at the set volume", async () => {
    const { engine, loads, starts } = fakeEngine();
    const controller = new AmbienceController(engine);
    await controller.unlock();
    controller.setVolume(0.7);
    controller.setLevel("drizzle");
    await unlockedLevel(loads, "drizzle");
    expect(starts[0]).toMatchObject({ gain: 0.7 });
    controller.setMuted(true);
    expect(starts[0]!.voice.ramps).toEqual([[0, 0.3]]);
    controller.setMuted(false);
    expect(starts[0]!.voice.ramps).toEqual([
      [0, 0.3],
      [0.7, 0.3],
    ]);
  });

  it("ramps volume changes over 0.1 s", async () => {
    const { engine, loads, starts } = fakeEngine();
    const controller = new AmbienceController(engine);
    await controller.unlock();
    controller.setLevel("moderate");
    await unlockedLevel(loads, "moderate");
    controller.setVolume(0.2);
    expect(starts[0]!.voice.ramps).toEqual([[0.2, 0.1]]);
  });

  it("starts only the final level after rapid clicks", async () => {
    const { engine, loads, starts } = fakeEngine();
    const controller = new AmbienceController(engine);
    await controller.unlock();
    controller.setLevel("drizzle");
    controller.setLevel("moderate");
    controller.setLevel("storm");
    expect(loads).toHaveLength(3);
    for (const load of loads) load.resolve(`handle`);
    await tick();
    expect(starts).toHaveLength(1);
    expect(loads[2]!.sources[0]!.src).toContain("storm");
  });

  it("dispose stops the voice and drops pending loads", async () => {
    const { engine, loads, starts } = fakeEngine();
    const controller = new AmbienceController(engine);
    await controller.unlock();
    controller.setLevel("drizzle");
    await unlockedLevel(loads, "drizzle");
    controller.setLevel("moderate");
    controller.dispose();
    for (const load of loads) load.resolve("late");
    await tick();
    expect(starts).toHaveLength(1);
    expect(starts[0]!.voice.stops).toEqual([0]);
  });
});
