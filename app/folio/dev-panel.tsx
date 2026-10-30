// Developer view: read-only emotion bars, intensity, tempo, track.
// Opened by Shift+D or ?dev. Nothing here leaks into normal mode.
"use client";

import type { SceneAttr } from "@/core/bookmap";

export interface DevBar {
  label: string;
  value: number;
}

export function DevPanel({
  open,
  onClose,
  sceneLabel,
  bars,
  intensity,
  tempo,
  trackTitle,
  sceneAttr,
}: {
  open: boolean;
  onClose: () => void;
  sceneLabel: string;
  bars: DevBar[];
  intensity: number | null;
  tempo: number | null;
  trackTitle: string;
  sceneAttr?: SceneAttr | null;
}) {
  if (!open) return null;
  const ordered = [...bars].sort((a, b) => b.value - a.value);
  return (
    <div className="dev-panel" role="complementary" aria-label="Developer panel">
      <div className="dev-head">
        <span className="dev-tag">DEV</span>
        <span className="dev-scene">{sceneLabel}</span>
        <button type="button" className="dev-x" onClick={onClose} aria-label="Close developer panel">
          ×
        </button>
      </div>
      {ordered.map((bar, i) => (
        <div className="dev-bar" key={bar.label}>
          <span>{bar.label}</span>
          <span className="dev-track">
            <span className={`dev-fill${i === 0 ? " top" : ""}`} style={{ width: `${Math.round(bar.value * 100)}%` }} />
          </span>
          <span className="dev-num">{bar.value.toFixed(2)}</span>
        </div>
      ))}
      <div className="dev-row">
        intensity <span className="mono">{intensity === null ? "—" : intensity.toFixed(2)}</span>
      </div>
      <div className="dev-row">
        tempo <span className="mono">{tempo === null ? "—" : tempo.toFixed(2)}</span>
      </div>
      <div className="dev-row">Track: {trackTitle}</div>
      {sceneAttr ? (
        <>
          <div className="dev-row">Location: {sceneAttr.location || "—"}</div>
          <div className="dev-row">Time of day: {sceneAttr.timeOfDay || "—"}</div>
          <div className="dev-row">Weather: {sceneAttr.weather || "—"}</div>
          <div className="dev-row">Cast: {sceneAttr.cast.length > 0 ? sceneAttr.cast.join(", ") : "—"}</div>
          <div className="dev-row">Key objects: {sceneAttr.keyObjects.length > 0 ? sceneAttr.keyObjects.join(", ") : "—"}</div>
        </>
      ) : null}
    </div>
  );
}
