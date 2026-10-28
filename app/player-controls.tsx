// Player controls: next track, mix toggle, style select, playlist toggle.
// No audio here, so the bar layout can change without touching the engine.
import type { StyleInfo } from "@/core/music";

export function PlayerControls({
  canNext,
  onNext,
  mixOn,
  onToggleMix,
  styles,
  styleId,
  onStyleChange,
  playlistLabel,
  playlistOn,
  onTogglePlaylist,
  controlsDisabled,
}: {
  canNext: boolean;
  onNext: () => void;
  mixOn: boolean;
  onToggleMix: () => void;
  styles: StyleInfo[];
  styleId: string | null;
  onStyleChange: (style: string) => void;
  playlistLabel: string | null;
  playlistOn: boolean;
  onTogglePlaylist: () => void;
  controlsDisabled: boolean;
}) {
  return (
    <>
      <button type="button" onClick={onNext} disabled={!canNext} aria-label="Cambiar track">
        Cambiar track
      </button>
      <button
        type="button"
        onClick={onToggleMix}
        disabled={controlsDisabled}
        aria-pressed={mixOn}
        aria-label="Mezclar bandas"
      >
        Mezclar bandas
      </button>
      {playlistLabel !== null ? (
        <button
          type="button"
          className="chopin"
          onClick={onTogglePlaylist}
          aria-pressed={playlistOn}
        >
          {playlistLabel}
        </button>
      ) : null}
      {styles.length >= 2 ? (
        <label className="player-note">
          Estilo
          <select
            value={styleId ?? ""}
            onChange={(e) => onStyleChange(e.target.value)}
            aria-label="Estilo"
            disabled={controlsDisabled}
          >
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
