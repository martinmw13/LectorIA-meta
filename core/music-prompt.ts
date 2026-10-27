// Deterministic music track prompts. Every track shares one orchestra
// and one folk-like leitmotif so the 15 tracks sound like one soundtrack;
// the key, lead colour, dynamics, and tempo vary per cluster.
import type { EmotionId } from "./types";

const ORCHESTRA =
  "Storybook fantasy film score for chamber orchestra: strings, flute, clarinet, oboe, French horn, harp, celesta, timpani and light percussion, with a recurring simple folk-like leitmotif";

export const SOUNDTRACK_BASE = `${ORCHESTRA} in a major key, instrumental, no vocals, seamless loop.`;

const SOUNDTRACK_BASE_MINOR = `${ORCHESTRA} in a minor key, instrumental, no vocals, seamless loop.`;

const MINOR_MOODS: ReadonlySet<EmotionId> = new Set(["tristeza", "suspenso", "misterio", "combate"]);

const MOOD_WORDS: Record<EmotionId, string> = {
  calma: "calm and gentle",
  alegria: "bright and joyful",
  tristeza: "tender and sorrowful",
  suspenso: "tense and expectant",
  misterio: "mysterious and veiled",
  aventura: "bold and roaming",
  combate: "driving and fierce",
  asombro: "wonder filled and luminous",
};

// Lead colour per dominant emotion, drawn from the same orchestra.
const LEAD: Record<EmotionId, string> = {
  calma: "flute and harp",
  alegria: "clarinet and pizzicato strings",
  tristeza: "solo oboe over sustained strings",
  suspenso: "tremolo strings and low pulses",
  misterio: "celesta and muted strings",
  aventura: "horn call over driving strings",
  combate: "brass and timpani ostinato",
  asombro: "harp glissandi and high strings",
};

// Picture book scoring stays in a playable acoustic range.
export function bpmRange(tempo: number): [number, number] {
  const center = Math.round(60 + tempo * 100);
  return [center - 10, center + 10];
}

// Five buckets tuned to the Oz centroid range (about 0.2 to 0.7) so the
// fight clusters land on strong or loud instead of moderate.
function dynamics(intensity: number): string {
  if (intensity < 0.3) return "delicate dynamics";
  if (intensity < 0.38) return "soft dynamics";
  if (intensity < 0.47) return "moderate dynamics";
  if (intensity < 0.55) return "strong dynamics";
  return "loud dynamics";
}

function tempoWord(tempo: number): string {
  if (tempo < 0.35) return "slow";
  if (tempo < 0.5) return "steady";
  if (tempo < 0.65) return "brisk";
  return "driving";
}

export function buildTrackPrompt(input: {
  top: { id: EmotionId; weight: number }[];
  intensity: number;
  tempo: number;
}): string {
  const [first, second, third] = input.top;
  const base = first !== undefined && MINOR_MOODS.has(first.id) ? SOUNDTRACK_BASE_MINOR : SOUNDTRACK_BASE;
  let mood = `Lead ${LEAD[first?.id ?? "calma"]}`;
  if (second !== undefined) mood += `, ${MOOD_WORDS[second.id]} undertone`;
  if (third !== undefined && third.weight >= 0.15) mood += `, a touch of ${MOOD_WORDS[third.id]}`;
  const [lo, hi] = bpmRange(input.tempo);
  const prompt = `${base} ${mood}, ${dynamics(input.intensity)}, ${tempoWord(input.tempo)} ${lo}-${hi} BPM.`;
  if (prompt.length <= 400) return prompt;
  const short = `${base} Lead ${LEAD[first?.id ?? "calma"]}, ${dynamics(input.intensity)}, ${tempoWord(input.tempo)} ${lo}-${hi} BPM.`;
  if (short.length <= 400) return short;
  return short.slice(0, 400);
}
