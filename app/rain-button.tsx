"use client";

import { useEffect, useRef, useState } from "react";
import {
  AMBIENCES,
  DEFAULT_AMBIENCE_VOLUME,
  ambienceLabel,
  levelById,
  nextLevel,
} from "@/core/ambience";
import { loadAmbiencePrefs, saveAmbiencePrefs } from "./ambience-prefs";
import { AmbienceController } from "./ambience-controller";
import { WebAmbienceEngine } from "./ambience-engine";

const RAIN = AMBIENCES[0]!;

// One drop cycle: how long the button replays its animation after a click.
const ANIM_MS = 1400;

const DROPS: Record<string, Array<[number, number]>> = {
  drizzle: [
    [7.5, 14.2],
    [10, 14.2],
    [12.5, 14.2],
  ],
  moderate: [
    [6.5, 13.8],
    [10, 13.8],
    [13.5, 13.8],
    [6.5, 15.9],
    [10, 15.9],
    [13.5, 15.9],
  ],
  storm: [
    [6, 14],
    [8, 14],
    [13.5, 14],
    [15.5, 14],
    [6, 16.2],
  ],
};

// The button owns its controller: it loads prefs once, saves on change,
// and starts the stored level on the first gesture anywhere in the page.
export function RainAmbience({ muted }: { muted: boolean }) {
  const controllerRef = useRef<AmbienceController | null>(null);
  const [level, setLevel] = useState("off");
  const [volume, setVolume] = useState(DEFAULT_AMBIENCE_VOLUME);
  const [burst, setBurst] = useState(0);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AmbienceController(new WebAmbienceEngine());
    controllerRef.current = controller;
    const prefs = loadAmbiencePrefs();
    if (prefs) {
      controller.setVolume(prefs.volume);
      setVolume(prefs.volume);
      if (prefs.level !== "off" && levelById(RAIN, prefs.level)) {
        controller.setLevel(prefs.level);
        setLevel(prefs.level);
      }
    }
    const unlock = () => void controller.unlock();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(
    () => () => {
      if (burstTimer.current) clearTimeout(burstTimer.current);
    },
    [],
  );

  function cycle() {
    const controller = controllerRef.current;
    if (!controller) return;
    void controller.unlock();
    const id = nextLevel(RAIN, level);
    controller.setLevel(id);
    setLevel(id);
    saveAmbiencePrefs({ level: id, volume });
    setBurst((b) => b + 1);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setBurst(0), ANIM_MS);
  }

  function changeVolume(value: number) {
    controllerRef.current?.setVolume(value);
    setVolume(value);
    saveAmbiencePrefs({ level, volume: value });
  }

  const label = ambienceLabel(RAIN, level);
  return (
    <>
      <button
        type="button"
        className="skip rain"
        data-level={level}
        data-anim={burst ? "1" : undefined}
        onClick={cycle}
        aria-label={label}
        title={label}
      >
        {/* key replays the one-shot animation on rapid clicks */}
        <svg
          key={burst}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            className="rain-cloud"
            d="M14.5 12.2h-8.3a3.4 3.4 0 0 1-.6-6.7 4.6 4.6 0 0 1 9-1.1 3 3 0 0 1-.1 7.8z"
            strokeLinejoin="round"
          />
          {(DROPS[level] ?? []).map(([x, y], i) => (
            <line
              key={i}
              className="rain-drop"
              x1={x}
              y1={y}
              x2={x}
              y2={y + (level === "drizzle" ? 1.8 : 1.5)}
            />
          ))}
          {level === "storm" ? (
            <polygon
              className="rain-bolt"
              points="11.3,13.4 9.3,16.2 10.6,16.2 10,18.8 12.5,15.6 11.2,15.6"
              fill="#f2c230"
              stroke="none"
            />
          ) : null}
        </svg>
      </button>
      {level !== "off" ? (
        <input
          type="range"
          className="rain-volume"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          aria-label="Rain volume"
        />
      ) : null}
    </>
  );
}
