"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { WARMTH_KEY, applyWarmth, loadWarmth, parseWarmth, warmthBand } from "../warmth";

export function WarmthControl() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    try {
      setValue(loadWarmth(window.localStorage));
    } catch {
      // Private mode: neutral paper.
    }
  }, []);

  function change(next: number) {
    const clamped = parseWarmth(next);
    setValue(clamped);
    applyWarmth(clamped);
    try {
      window.localStorage.setItem(WARMTH_KEY, String(clamped));
    } catch {
      // The slider still works for the session.
    }
  }

  const band = warmthBand(value);
  return (
    <label className="warmth" title={`Page warmth: ${band}`}>
      <Icon name="sun" size={14} aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        aria-label="Page warmth"
        aria-valuetext={band}
      />
    </label>
  );
}
