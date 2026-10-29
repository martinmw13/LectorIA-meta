// Single swap point for the music-mode control (style stickers plus the
// Chopin button). The player renders <MusicStyleControl /> and must not
// know its internals: replacing this file and
// app/styles/music-style-control.css swaps the whole design.
"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicMode, MusicModeId } from "@/core/music";
import { heroArt, type HeroArt } from "../skin-art";
import { useSkin } from "../use-skin";
import { ButtonFx } from "../button-fx";
import { ClassicMusicFx, type ClassicMusicMode } from "./classic-music-fx";

export type MusicStyleControlProps = {
  modes: MusicMode[];
  current: MusicModeId | null;
  onAdvance: (to?: MusicModeId) => void;
};

// One pop cycle: how long the newly current button replays its animation.
const ANIM_MS = 600;
// One burst cycle: how long the overlay signature replays. Separate from
// data-anim so a click replays even while the pointer hovers the button.
const BURST_MS = 1800;

function stickerFor(id: string, label: string, art: HeroArt): string {
  const piano = /piano/i.test(id) || /piano/i.test(label);
  return piano ? art.piano : art.orchestra;
}

function fxModeFor(id: string, label: string): ClassicMusicMode {
  const piano = /piano/i.test(id) || /piano/i.test(label);
  return piano ? "piano" : "orchestra";
}

export function MusicStyleControl({ modes, current, onAdvance }: MusicStyleControlProps) {
  const styles = modes.filter((m) => m.kind === "style");
  const playlist = modes.find((m) => m.kind === "playlist") ?? null;
  const art = heroArt(useSkin());
  // The button whose mode just became current pops once, then rests still.
  const [anim, setAnim] = useState<MusicModeId | null>(null);
  // Burst counter: remounts the overlays (React key) so the click signature
  // restarts even when hover already plays the same element. burstFor pins
  // data-burst to the button that just became current.
  const [burst, setBurst] = useState(0);
  const [burstFor, setBurstFor] = useState<MusicModeId | null>(null);
  const firstRef = useRef(true);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session-driven changes (Chopin toggle-back) animate too; the first
  // render is skipped so restoring prefs on load stays still.
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    setAnim(current);
    setBurst((b) => b + 1);
    setBurstFor(current);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim(null), ANIM_MS);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    // Only the flag clears; the key stays so nothing remounts (replays) later.
    burstTimer.current = setTimeout(() => setBurstFor(null), BURST_MS);
    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, [current]);

  useEffect(
    () => () => {
      if (animTimer.current) clearTimeout(animTimer.current);
      if (burstTimer.current) clearTimeout(burstTimer.current);
    },
    [],
  );
  return (
    <>
      {styles.length >= 2 ? (
        <span className="stickers" role="group" aria-label="Music style" data-art="hero">
          {styles.map((s) => (
            <span className="sticker-wrap" key={s.id}>
              <button
                type="button"
                className="sticker"
                data-anim={anim === s.id ? "1" : undefined}
                data-burst={burstFor === s.id ? "1" : undefined}
                onClick={() => onAdvance(s.id)}
                aria-pressed={current === s.id}
                aria-label={s.label}
                title={s.label}
              >
                <img src={stickerFor(s.id, s.label, art)} alt="" width={40} height={40} />
                <ButtonFx kind="music" key={burst} />
                <ClassicMusicFx mode={fxModeFor(s.id, s.label)} key={`m-${burst}`} />
              </button>
              <span className="sticker-dot" aria-hidden="true" />
            </span>
          ))}
        </span>
      ) : null}
      {playlist !== null ? (
        <span className="sticker-wrap">
          <button
            type="button"
            className="chopin"
            data-anim={anim === playlist.id ? "1" : undefined}
            data-burst={burstFor === playlist.id ? "1" : undefined}
            onClick={() => onAdvance(playlist.id)}
            aria-pressed={current === playlist.id}
            aria-label="Just play Chopin"
            title="Just play Chopin"
          >
            <img
              src={art.chopin}
              alt="Just play Chopin"
              width={40}
              height={40}
            />
            <ButtonFx kind="music" key={burst} />
            <ClassicMusicFx mode="chopin" key={`m-${burst}`} />
          </button>
          <span className="sticker-dot" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
}
