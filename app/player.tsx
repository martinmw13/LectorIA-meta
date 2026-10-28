"use client";

import { useEffect, useRef, useState } from "react";
import { MUSIC_CONFIG } from "@/core/music";
import { effectiveEnd, gainVolume } from "@/core/music-playback";
import type { StyleInfo, Track } from "@/core/music";
import { PlayerControls } from "./player-controls";

// Two audio elements with equal-power crossfades. Volume lives in a
// ref, so the slider never re-runs the track effect or touches src.
// Nothing plays before the first user press. Reduced motion only
// affects visuals; the audio fade always runs its full length.
export function Player({
  track,
  replayNonce,
  fadeSec,
  soundtrackName,
  isFallback,
  canSkip,
  onSkip,
  mixOn,
  onToggleMix,
  styles,
  styleId,
  onStyleChange,
  onEnded,
  playlistOn,
  playlistLabel,
  onTogglePlaylist,
  controlsDisabled,
}: {
  track: Track | null;
  replayNonce: number;
  fadeSec: number;
  soundtrackName: string | null;
  isFallback: boolean;
  canSkip: boolean;
  onSkip: () => void;
  mixOn: boolean;
  onToggleMix: () => void;
  styles: StyleInfo[];
  styleId: string | null;
  onStyleChange: (style: string) => void;
  onEnded: (trackId: string) => void;
  playlistOn: boolean;
  playlistLabel: string | null;
  onTogglePlaylist: () => void;
  controlsDisabled: boolean;
}) {
  const firstRef = useRef<HTMLAudioElement | null>(null);
  const secondRef = useRef<HTMLAudioElement | null>(null);
  const audibleRef = useRef(0);
  const levelRef = useRef<[number, number]>([1, 0]);
  const gainRef = useRef<[number, number]>([0, 0]);
  const segmentEndRef = useRef<string | null>(null);
  const volumeRef = useRef(0.8);
  const fadeRef = useRef<number | null>(null);
  const loopArmedRef = useRef<string | null>(null);
  const trackRef = useRef<Track | null>(track);
  trackRef.current = track;
  const fadeSecRef = useRef(fadeSec);
  fadeSecRef.current = fadeSec;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const playingRef = useRef(false);
  const startedRef = useRef(false);
  const firstPlayRef = useRef(true);

  // Scheduler fade when set, else the config default; never 0 mid session.
  function loopFadeSec() {
    return fadeSecRef.current > 0 ? fadeSecRef.current : MUSIC_CONFIG.crossfadeSec;
  }
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const requestPlayRef = useRef((_: Track, __: number) => {});

  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  function applyLevels() {
    const els = [firstRef.current, secondRef.current];
    els.forEach((el, i) => {
      if (el)
        el.volume = gainVolume(
          levelRef.current[i] ?? 0,
          volumeRef.current,
          gainRef.current[i] ?? 0,
        );
    });
  }

  function cancelFade() {
    if (fadeRef.current !== null) {
      cancelAnimationFrame(fadeRef.current);
      fadeRef.current = null;
    }
  }

  // Assigned each render so handlers always see fresh refs. Fades from
  // the currently louder element to the newest track; a mid-fade request
  // cancels the pending fade and starts from current levels.
  requestPlayRef.current = (next: Track, durSec: number) => {
    const els = [firstRef.current, secondRef.current];
    const srcIdx = (levelRef.current[0] ?? 0) >= (levelRef.current[1] ?? 0) ? 0 : 1;
    const dstIdx = 1 - srcIdx;
    const srcEl = els[srcIdx];
    const dst = els[dstIdx];
    if (!srcEl || !dst) return;
    cancelFade();
    if (trackRef.current?.id !== next.id) loopArmedRef.current = null;
    trackRef.current = next;
    segmentEndRef.current = null;
    gainRef.current[dstIdx] = next.gainDb ?? 0;
    dst.src = next.src;
    dst.onloadedmetadata = () => {
      if (next.startSec > 0 && Number.isFinite(dst.duration) && next.startSec < dst.duration) {
        try {
          dst.currentTime = next.startSec;
        } catch {
          // Past the end; leave playback at zero.
        }
      }
    };
    if (!playingRef.current || durSec <= 0) {
      levelRef.current = [0, 0];
      levelRef.current[dstIdx] = 1;
      audibleRef.current = dstIdx;
      srcEl.pause();
      applyLevels();
      if (playingRef.current) void dst.play().catch(() => undefined);
      return;
    }
    if (playingRef.current) void dst.play().catch(() => undefined);
    const startSrc = levelRef.current[srcIdx] ?? 0;
    const startDst = levelRef.current[dstIdx] ?? 0;
    let t0 = performance.now();
    let prev = t0;
    const tick = (now: number) => {
      // Pause freezes the fade; resume continues from the frozen point.
      if (!playingRef.current) {
        t0 += now - prev;
        prev = now;
        fadeRef.current = requestAnimationFrame(tick);
        return;
      }
      prev = now;
      const t = Math.min(1, (now - t0) / (durSec * 1000));
      levelRef.current[srcIdx] = startSrc * Math.cos((t * Math.PI) / 2);
      levelRef.current[dstIdx] = startDst + (1 - startDst) * Math.sin((t * Math.PI) / 2);
      applyLevels();
      if (t < 1) {
        fadeRef.current = requestAnimationFrame(tick);
        return;
      }
      fadeRef.current = null;
      levelRef.current[srcIdx] = 0;
      levelRef.current[dstIdx] = 1;
      audibleRef.current = dstIdx;
      applyLevels();
      srcEl.pause();
    };
    fadeRef.current = requestAnimationFrame(tick);
  };

  const trackId = track?.id ?? null;
  useEffect(() => {
    const next = trackRef.current;
    if (!started || !next) {
      // Before the first press, swaps only change src.
      if (!started && next) {
        const el = [firstRef.current, secondRef.current][audibleRef.current];
        if (el && !el.src.endsWith(next.src)) el.src = next.src;
        gainRef.current[audibleRef.current] = next.gainDb ?? 0;
        applyLevels();
      }
      return;
    }
    // The single start path: fade 0 on the very first press. replayNonce
    // re-cues the same track (one-track playlist wrap); nothing else is a dep
    // so volume, pause/play, and re-renders never restart the track.
    const dur = firstPlayRef.current ? 0 : fadeSecRef.current;
    firstPlayRef.current = false;
    requestPlayRef.current(next, dur);
  }, [started, trackId, replayNonce]);

  useEffect(() => cancelFade, []);

  function handleTimeUpdate(index: number, el: HTMLAudioElement) {
    const next = trackRef.current;
    if (!next || index !== audibleRef.current) return;
    const end = effectiveEnd(next.endSec, el.duration);
    if (!Number.isFinite(end)) return;
    // A non-looping or playlist track ends at the segment end, where the
    // media may keep playing, so fire the ended path once per play.
    if (!next.loop || playlistOn) {
      if (el.currentTime >= end && segmentEndRef.current !== next.id) {
        segmentEndRef.current = next.id;
        onEndedRef.current(next.id);
      }
      return;
    }
    const fade = loopFadeSec();
    if (end <= fade * 2) return;
    const remain = end - el.currentTime;
    if (remain <= fade && loopArmedRef.current !== next.id) {
      loopArmedRef.current = next.id;
      requestPlayRef.current(next, fade);
    } else if (remain > fade + 1) {
      loopArmedRef.current = null;
    }
  }

  function handleEnded(index: number) {
    const els = [firstRef.current, secondRef.current];
    // An element that ends while a fade is running is the one fading out.
    if (index !== audibleRef.current || fadeRef.current !== null) {
      els[index]?.pause();
      return;
    }
    const next = trackRef.current;
    if (!next || segmentEndRef.current === next.id) return;
    if (next.loop && !playlistOn) {
      requestPlayRef.current(next, loopFadeSec());
      return;
    }
    segmentEndRef.current = next.id;
    onEndedRef.current(next.id);
  }

  function toggle() {
    const both = [firstRef.current, secondRef.current];
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
      playingRef.current = true;
      setPlaying(true);
      return;
    }
    if (playingRef.current) {
      for (const el of both) el?.pause();
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    playingRef.current = true;
    setPlaying(true);
    let heard = false;
    both.forEach((el, i) => {
      if (el && (levelRef.current[i] ?? 0) > 0.02) {
        heard = true;
        void el.play().catch(() => undefined);
      }
    });
    const next = trackRef.current;
    if (!heard && next) requestPlayRef.current(next, 0);
  }

  function changeVolume(value: number) {
    setVolume(value);
    volumeRef.current = value;
    applyLevels();
  }

  const credit = track ? [track.composer, track.artist].filter(Boolean).join(", ") : "";
  const detail = track
    ? [playlistOn ? null : track.emotion, soundtrackName, credit || null, track.license || null]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="player" role="region" aria-label="Music player" data-reduced-motion={reducedMotion}>
      <audio ref={firstRef} preload="auto" onTimeUpdate={(e) => handleTimeUpdate(0, e.currentTarget)} onEnded={() => handleEnded(0)} />
      <audio ref={secondRef} preload="auto" onTimeUpdate={(e) => handleTimeUpdate(1, e.currentTarget)} onEnded={() => handleEnded(1)} />
      <button type="button" onClick={toggle} aria-label={playing ? "Pause music" : "Play music"}>
        {playing ? "Pause" : "Play"}
      </button>
      <span className="player-track" aria-live="polite">
        {track ? track.title : "Music unavailable"}
        {detail ? ` · ${detail}` : ""}
      </span>
      <label className="player-volume">
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          aria-label="Volume"
        />
      </label>
      <PlayerControls
        canNext={canSkip}
        onNext={onSkip}
        mixOn={mixOn}
        onToggleMix={onToggleMix}
        styles={styles}
        styleId={styleId}
        onStyleChange={onStyleChange}
        playlistLabel={playlistLabel}
        playlistOn={playlistOn}
        onTogglePlaylist={onTogglePlaylist}
        controlsDisabled={controlsDisabled}
      />
      {isFallback && !playlistOn ? <span className="player-note">de otra banda sonora</span> : null}
      {track?.attribution ? <span className="player-note">{track.attribution}</span> : null}
      {track?.sourceUrl ? (
        <a className="player-note" href={track.sourceUrl} rel="noopener noreferrer" target="_blank">
          Source
        </a>
      ) : null}
    </div>
  );
}
