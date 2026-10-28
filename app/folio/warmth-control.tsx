"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
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
      <Icon name="sun" size={14} aria-hidden="true" />
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
