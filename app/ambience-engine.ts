// Web Audio engine behind AmbienceController. One lazily created
// AudioContext; loops run through BufferSource loop, so fades on the
// audio clock still finish in a background tab.
import type { AmbienceEngine, AmbienceVoice } from "./ambience-controller";
import type { AmbienceSource } from "@/core/ambience";

let shared: AudioContext | null = null;
const decoded = new Map<string, Promise<AudioBuffer>>();

function context(): AudioContext {
  if (!shared) shared = new AudioContext();
  return shared;
}

export function canPlayAudio(type: string): boolean {
  if (type === "") return false;
  try {
    const verdict = new Audio().canPlayType(type);
    return verdict === "probably" || verdict === "maybe";
  } catch {
    return false;
  }
}

// First source canPlayType rates "probably" or "maybe", else the first.
function pickSource(sources: AmbienceSource[]): AmbienceSource | null {
  if (sources.length === 0) return null;
  try {
    return sources.find((source) => canPlayAudio(source.type)) ?? sources[0]!;
  } catch {
    return sources[0]!;
  }
}

export class WebAmbienceEngine implements AmbienceEngine {
  private createContext: () => AudioContext;

  constructor(options: { context?: () => AudioContext } = {}) {
    this.createContext = options.context ?? context;
  }

  load(sources: AmbienceSource[]): Promise<AudioBuffer> {
    const ctx = this.createContext();
    const picked = pickSource(sources);
    if (!picked) return Promise.reject(new Error("no ambience sources"));
    let pending = decoded.get(picked.src);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(picked.src);
        if (!response.ok) throw new Error(`ambience fetch failed: ${picked.src}`);
        return ctx.decodeAudioData(await response.arrayBuffer());
      })();
      decoded.set(picked.src, pending);
      pending.then(null, () => void decoded.delete(picked.src));
    }
    return pending;
  }

  start(handle: unknown, gain: number, fadeSec: number): AmbienceVoice {
    const ctx = this.createContext();
    const source = ctx.createBufferSource();
    source.buffer = handle as AudioBuffer;
    source.loop = true;
    // One curve per node, so a later event never overlaps an active curve.
    const fadeIn = ctx.createGain();
    const fadeOut = ctx.createGain();
    const level = ctx.createGain();
    const at = ctx.currentTime;
    fadeOut.gain.value = 1;
    level.gain.value = gain;
    if (fadeSec > 0) {
      // Sine in, matching the outgoing voice's cosine out for equal power.
      fadeIn.gain.value = 0;
      const curve = new Float32Array(32).map((_, i) => Math.sin(((i / 31) * Math.PI) / 2));
      try {
        fadeIn.gain.setValueCurveAtTime(curve, at, fadeSec);
      } catch {
        fadeIn.gain.value = 1;
      }
    } else {
      fadeIn.gain.value = 1;
    }
    source.connect(fadeIn);
    fadeIn.connect(fadeOut);
    fadeOut.connect(level);
    level.connect(ctx.destination);
    source.start(at);
    let stopped = false;
    const disconnect = () => {
      source.disconnect();
      fadeIn.disconnect();
      fadeOut.disconnect();
      level.disconnect();
    };
    return {
      ramp(next: number, sec: number) {
        // Level never holds a curve, so cancel + anchor + ramp cannot overlap one.
        const now = ctx.currentTime;
        try {
          level.gain.cancelScheduledValues(now);
          level.gain.setValueAtTime(level.gain.value, now);
          level.gain.linearRampToValueAtTime(next, now + Math.max(0, sec));
        } catch {
          level.gain.value = next;
        }
      },
      stop(sec: number) {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        const span = Math.max(0, sec);
        if (span <= 0) {
          try {
            source.stop(now);
          } catch {
            // Already stopped.
          }
          disconnect();
          return;
        }
        // Cosine out over the same span: sin^2 + cos^2 keeps equal power.
        const curve = new Float32Array(32).map((_, i) => Math.cos(((i / 31) * Math.PI) / 2));
        try {
          fadeOut.gain.setValueCurveAtTime(curve, now, span);
        } catch {
          fadeOut.gain.value = 0;
        }
        source.onended = () => disconnect();
        try {
          source.stop(now + span);
        } catch {
          // Already stopped; onended still disconnects.
        }
      },
    };
  }

  unlock(): Promise<void> {
    return this.createContext().resume().then(() => undefined);
  }
}
