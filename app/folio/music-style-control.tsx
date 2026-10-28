// Single swap point for the music-mode control (style stickers plus the
// Chopin button). The player renders <MusicStyleControl /> and must not
// know its internals: replacing this file and
// app/styles/music-style-control.css swaps the whole design.
"use client";

import { useEffect, useRef, useState } from "react";
import type { MusicMode, MusicModeId } from "@/core/music";
import { heroArt, type HeroArt } from "../skin-art";
import { useSkin } from "../use-skin";

export type MusicStyleControlProps = {
  modes: MusicMode[];
  current: MusicModeId | null;
  onAdvance: (to?: MusicModeId) => void;
};

// One pop cycle: how long the newly current button replays its animation.
const ANIM_MS = 450;

function stickerFor(id: string, label: string, art: HeroArt): string {
  const piano = /piano/i.test(id) || /piano/i.test(label);
  return piano ? art.piano : art.orchestra;
}

export function MusicStyleControl({ modes, current, onAdvance }: MusicStyleControlProps) {
  const styles = modes.filter((m) => m.kind === "style");
  const playlist = modes.find((m) => m.kind === "playlist") ?? null;
  const art = heroArt(useSkin());
  // The button whose mode just became current pops once, then rests still.
  const [anim, setAnim] = useState<MusicModeId | null>(null);
  const firstRef = useRef(true);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session-driven changes (Chopin toggle-back) animate too; the first
  // render is skipped so restoring prefs on load stays still.
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    setAnim(current);
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setAnim(null), ANIM_MS);
    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, [current]);

  useEffect(
    () => () => {
      if (animTimer.current) clearTimeout(animTimer.current);
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
                onClick={() => onAdvance(s.id)}
                aria-pressed={current === s.id}
                aria-label={s.label}
                title={s.label}
              >
                <img src={stickerFor(s.id, s.label, art)} alt="" width={40} height={40} />
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
          </button>
          <span className="sticker-dot" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
}
