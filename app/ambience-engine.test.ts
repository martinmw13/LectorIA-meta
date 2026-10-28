import { describe, expect, it } from "vitest";
import { WebAmbienceEngine } from "./ambience-engine";

// Minimal fake AudioContext. Fake params record events and throw when an
// event lands inside an active curve's span on the same param, like Chrome.
class FakeParam {
  value = 0;
  curves: Array<{ start: number; end: number; values: number[] }> = [];
  ops: string[] = [];

  private active(at: number): boolean {
    return this.curves.some((curve) => at >= curve.start && at < curve.end);
  }

  private overlap(op: string): never {
    const error = new Error(`${op} overlaps an active curve`);
    error.name = "NotSupportedError";
    throw error;
  }

  cancelScheduledValues(at: number): void {
    this.ops.push("cancel");
    this.curves = this.curves.filter((curve) => curve.start < at);
  }

  setValueAtTime(value: number, at: number): void {
    if (this.active(at)) this.overlap("setValueAtTime");
    this.value = value;
    this.ops.push("set");
  }

  linearRampToValueAtTime(value: number, at: number): void {
    if (this.active(at)) this.overlap("linearRamp");
    this.value = value;
    this.ops.push("ramp");
  }

  setValueCurveAtTime(curve: Float32Array, at: number, duration: number): void {
    if (this.active(at)) this.overlap("setValueCurveAtTime");
    this.curves.push({ start: at, end: at + duration, values: Array.from(curve) });
    this.ops.push("curve");
  }
}

interface FakeGain {
  gain: FakeParam;
  disconnected: boolean;
  connect(): void;
  disconnect(): void;
}

interface FakeSource {
  buffer: unknown;
  loop: boolean;
  onended: (() => void) | null;
  stops: number[];
  disconnected: boolean;
  connect(): void;
  disconnect(): void;
  start(): void;
  stop(at: number): void;
}

function fakeContext() {
  const ctx = {
    currentTime: 0,
    destination: {},
    gains: [] as FakeGain[],
    sources: [] as FakeSource[],
    createGain(): FakeGain {
      const node: FakeGain = {
        gain: new FakeParam(),
        disconnected: false,
        connect() {},
        disconnect() {
          node.disconnected = true;
        },
      };
      ctx.gains.push(node);
      return node;
    },
    createBufferSource(): FakeSource {
      const source: FakeSource = {
        buffer: null,
        loop: false,
        onended: null,
        stops: [],
        disconnected: false,
        connect() {},
        disconnect() {
          source.disconnected = true;
        },
        start() {},
        stop(at: number) {
          source.stops.push(at);
        },
      };
      ctx.sources.push(source);
      return source;
    },
  };
  return ctx;
}

type FakeCtx = ReturnType<typeof fakeContext>;

function engineWith(ctx: FakeCtx): WebAmbienceEngine {
  return new WebAmbienceEngine({ context: () => ctx as unknown as AudioContext });
}

describe("ambience engine fades", () => {
  it("ramps and stops mid-fade without overlapping a curve", () => {
    const ctx = fakeContext();
    const voice = engineWith(ctx).start({}, 0.4, 1.5);
    ctx.currentTime = 0.5;
    expect(() => voice.ramp(0.2, 0.1)).not.toThrow();
    ctx.currentTime = 0.6;
    expect(() => voice.stop(2)).not.toThrow();
    const curved = ctx.gains.filter((gain) => gain.gain.curves.length > 0);
    const ramped = ctx.gains.filter((gain) => gain.gain.ops.includes("ramp"));
    expect(curved).toHaveLength(2);
    expect(ramped).toHaveLength(1);
    expect(curved).not.toContain(ramped[0]);
    ctx.sources[0]!.onended!();
    expect(ctx.gains.every((gain) => gain.disconnected)).toBe(true);
    expect(ctx.sources[0]!.disconnected).toBe(true);
  });

  it("ignores a second stop", () => {
    const ctx = fakeContext();
    const voice = engineWith(ctx).start({}, 0.4, 1.5);
    voice.stop(2);
    const curves = ctx.gains.flatMap((gain) => gain.gain.curves).length;
    voice.stop(2);
    expect(ctx.sources[0]!.stops).toHaveLength(1);
    expect(ctx.gains.flatMap((gain) => gain.gain.curves)).toHaveLength(curves);
  });

  it("pairs a sine fade-in with a cosine fade-out for equal power", () => {
    const ctx = fakeContext();
    const voice = engineWith(ctx).start({}, 0.4, 1.5);
    voice.stop(1.2);
    const fadeIn = ctx.gains[0]!.gain.curves[0]!.values;
    const fadeOut = ctx.gains[1]!.gain.curves[0]!.values;
    expect(fadeIn[0]).toBeCloseTo(0);
    expect(fadeIn[31]).toBeCloseTo(1);
    expect(fadeOut[0]).toBeCloseTo(1);
    expect(fadeOut[31]).toBeCloseTo(0);
    for (let i = 0; i < 32; i += 1) {
      const sine = fadeIn[i]!;
      const cosine = fadeOut[i]!;
      expect(sine * sine + cosine * cosine).toBeCloseTo(1, 5);
    }
  });
});
