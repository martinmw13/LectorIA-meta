"use client";

import { useEffect, useState } from "react";
import { WARMTH_KEY, WARMTH_MAX, WARMTH_STEPS, applyWarmth, warmthStep } from "../warmth";

export function WarmthControl() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      setStep(warmthStep(window.localStorage.getItem(WARMTH_KEY)));
    } catch {
      // Private mode: neutral paper.
    }
  }, []);

  function change(next: number) {
    setStep(next);
    applyWarmth(next);
    try {
      window.localStorage.setItem(WARMTH_KEY, String(next));
    } catch {
      // The slider still works for the session.
    }
  }

  return (
    <label className="warmth" title={`Page warmth: ${WARMTH_STEPS[step]}`}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
      </svg>
      <input
        type="range"
        min={0}
        max={WARMTH_MAX}
        step={1}
        value={step}
        onChange={(e) => change(Number(e.target.value))}
        aria-label="Page warmth"
        aria-valuetext={WARMTH_STEPS[step]}
      />
    </label>
  );
}
