// Pure part of active scene tracking: from a full snapshot of every
// section's live top, pick the last section at or above the reading
// line. Falls back to the first section, so fast scrolls never blank
// the music. Callers re-snapshot on every observer callback and pass
// only the trigger.
export interface SceneRect {
  id: string;
  top: number;
}

export function pickActiveScene(sections: SceneRect[], lineY: number): string | null {
  let best: string | null = null;
  for (const section of sections) {
    if (section.top <= lineY) best = section.id;
  }
  return best ?? sections[0]?.id ?? null;
}
