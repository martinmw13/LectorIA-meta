import { describe, expect, it } from "vitest";
import { bpmRange, buildTrackPrompt } from "./music-prompt";
import { EMOTIONS } from "./types";
import type { EmotionId } from "./types";

const ORCHESTRA =
  "chamber orchestra: strings, flute, clarinet, oboe, French horn, harp, celesta, timpani and light percussion";

describe("music prompts", () => {
  it("shares one orchestra and stays under 400 chars", () => {
    const seen = new Set<string>();
    for (const emotion of EMOTIONS) {
      const prompt = buildTrackPrompt({ top: [{ id: emotion, weight: 0.7 }], intensity: 0.5, tempo: 0.5 });
      expect(prompt).toContain(ORCHESTRA);
      expect(prompt.length).toBeLessThanOrEqual(400);
      seen.add(prompt);
    }
    expect(seen.size).toBe(EMOTIONS.length);
  });
  it("uses a minor key for dark moods and major otherwise", () => {
    const minor: EmotionId[] = ["tristeza", "suspenso", "misterio", "combate"];
    const major: EmotionId[] = ["calma", "alegria", "aventura", "asombro"];
    for (const id of minor) {
      expect(buildTrackPrompt({ top: [{ id, weight: 0.8 }], intensity: 0.5, tempo: 0.5 })).toContain("in a minor key");
    }
    for (const id of major) {
      expect(buildTrackPrompt({ top: [{ id, weight: 0.8 }], intensity: 0.5, tempo: 0.5 })).toContain("in a major key");
    }
  });
  it("names a third mood only at weight 0.15 and up", () => {
    const loud = { intensity: 0.6, tempo: 0.7 };
    const withThird = buildTrackPrompt({
      top: [
        { id: "combate", weight: 0.55 },
        { id: "suspenso", weight: 0.3 },
        { id: "aventura", weight: 0.15 },
      ],
      ...loud,
    });
    expect(withThird).toContain("a touch of bold and roaming");
    const withoutThird = buildTrackPrompt({
      top: [
        { id: "combate", weight: 0.6 },
        { id: "suspenso", weight: 0.3 },
        { id: "aventura", weight: 0.1 },
      ],
      ...loud,
    });
    expect(withoutThird).not.toContain("a touch of");
    expect(withThird.length).toBeLessThanOrEqual(400);
    expect(withoutThird.length).toBeLessThanOrEqual(400);
  });
  it("gives fight-level intensity strong or loud dynamics", () => {
    const prompt = (intensity: number) =>
      buildTrackPrompt({ top: [{ id: "combate", weight: 0.8 }], intensity, tempo: 0.7 });
    expect(prompt(0.49)).toContain("strong dynamics");
    expect(prompt(0.54)).toContain("strong dynamics");
    expect(prompt(0.63)).toContain("loud dynamics");
  });
  it("maps tempo to a word plus a BPM range in the acoustic band", () => {
    expect(bpmRange(0)).toEqual([50, 70]);
    expect(bpmRange(1)).toEqual([150, 170]);
    expect(buildTrackPrompt({ top: [{ id: "calma", weight: 0.7 }], intensity: 0.2, tempo: 0.2 })).toContain("slow");
    expect(buildTrackPrompt({ top: [{ id: "combate", weight: 0.7 }], intensity: 0.6, tempo: 0.8 })).toContain("driving");
  });
});
