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

// First source canPlayType rates "probably" or "maybe", else the first.
function pickSource(sources: AmbienceSource[]): AmbienceSource | null {
  if (sources.length === 0) return null;
  try {
    const probe = new Audio();
    return (
      sources.find((source) => {
        const verdict = probe.canPlayType(source.type);
        return verdict === "probably" || verdict === "maybe";
      }) ?? sources[0]!
    );
  } catch {
    return sources[0]!;
  }
}

export class WebAmbienceEngine implements AmbienceEngine {
  load(sources: AmbienceSource[]): Promise<AudioBuffer> {
    const picked = pickSource(sources);
    if (!picked) return Promise.reject(new Error("no ambience sources"));
    let pending = decoded.get(picked.src);
    if (!pending) {
      pending = (async () => {
        const response = await fetch(picked.src);
        if (!response.ok) throw new Error(`ambience fetch failed: ${picked.src}`);
        return context().decodeAudioData(await response.arrayBuffer());
      })();
      decoded.set(picked.src, pending);
      pending.then(null, () => void decoded.delete(picked.src));
    }
    return pending;
  }

  start(handle: unknown, gain: number, fadeSec: number): AmbienceVoice {
    const ctx = context();
    const source = ctx.createBufferSource();
    source.buffer = handle as AudioBuffer;
    source.loop = true;
    const out = ctx.createGain();
    out.gain.value = 0;
    source.connect(out);
    out.connect(ctx.destination);
    const at = ctx.currentTime;
    if (fadeSec > 0) {
      // Sine curve in, so the crossfade keeps equal power with the
      // outgoing voice fading out over the same span.
      const curve = new Float32Array(32).map((_, i) => gain * Math.sin(((i / 31) * Math.PI) / 2));
      out.gain.setValueCurveAtTime(curve, at, fadeSec);
    } else {
      out.gain.setValueAtTime(gain, at);
    }
    source.start(at);
    return {
      ramp(next: number, sec: number) {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(next, now + Math.max(0, sec));
      },
      stop(sec: number) {
        const now = ctx.currentTime;
        const span = Math.max(0, sec);
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + span);
        source.onended = () => {
          source.disconnect();
          out.disconnect();
        };
        try {
          source.stop(now + span);
        } catch {
          // Already stopped; onended still disconnects.
        }
      },
    };
  }

  unlock(): Promise<void> {
    return context().resume().then(() => undefined);
  }
}
