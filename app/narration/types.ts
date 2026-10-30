// Shared read-aloud shapes. The controller hook owns these at runtime;
// ScenePage consumes them for the highlight overlay and click-to-seek.
export type NarrationStatus = "idle" | "loading" | "ready" | "error";

export interface NarrationChapterEntry {
  ch: number;
  voice: string;
  src: string;
  manifest: string;
}

export interface NarrationPrefs {
  on: boolean;
  volume: number;
  voice: string;
}
