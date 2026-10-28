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
import { Icon, iconSkin } from "./icons";
import type { RainIconName } from "./icons-rain";
import { useSkin } from "./use-skin";

const RAIN = AMBIENCES[0]!;

// One drop cycle: how long the button replays its animation after a click.
const ANIM_MS = 1400;

// The button owns its controller: it loads prefs once, saves on change,
// and starts the stored level on the first gesture anywhere in the page.
export function RainAmbience({ muted, duck = 1 }: { muted: boolean; duck?: number }) {
  const controllerRef = useRef<AmbienceController | null>(null);
  const [level, setLevel] = useState("off");
  const [volume, setVolume] = useState(DEFAULT_AMBIENCE_VOLUME);
  const [burst, setBurst] = useState(0);
  // Server render uses the default so hydration matches; the live skin
  // applies on mount via useSyncExternalStore.
  const skin = useSkin();
  // Same fallback rule as <Icon>; also drives the per-skin CSS via data-art.
  const artSkin = iconSkin(`rain-${level}` as RainIconName, skin);
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

  useEffect(() => {
    controllerRef.current?.setDuck(duck);
  }, [duck]);

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
        data-art={artSkin}
        data-anim={burst ? "1" : undefined}
        onClick={cycle}
        aria-label={label}
        title={label}
      >
        {/* key replays the one-shot animation on rapid clicks */}
        <span className="face" key={burst}>
          <Icon name={`rain-${level}` as RainIconName} skin={artSkin} />
        </span>
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
