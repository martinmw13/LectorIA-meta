// The read-aloud voice picker: a quiet labelled select next to Read
// aloud. Hidden unless the current chapter has more than one voice.
"use client";

import { NARRATION_VOICES } from "@/core/narration";

export function VoiceSelector({
  voices,
  voice,
  onChange,
}: {
  voices: string[];
  voice: string;
  onChange: (voice: string) => void;
}) {
  const options = NARRATION_VOICES.filter((v) => voices.includes(v.id));
  if (options.length < 2) return null;
  return (
    <label className="read-aloud-voice">
      <span>Voice</span>
      <select value={voice} onChange={(e) => onChange(e.target.value)} aria-label="Narration voice">
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
}
