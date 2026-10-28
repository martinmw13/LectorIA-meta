// Player extras: style select and the Chopin playlist toggle. Transport
// lives in the player so the bar reads prev, play, next, then the
// now-playing line. No audio here, so the bar layout can change without
// touching the engine.
import type { StyleInfo } from "@/core/music";

export function PlayerControls({
  styles,
  styleId,
  onStyleChange,
  playlistLabel,
  playlistOn,
  onTogglePlaylist,
  controlsDisabled,
}: {
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
      {styles.length >= 2 ? (
        <label className="player-note">
          <select
            value={styleId ?? ""}
            onChange={(e) => onStyleChange(e.target.value)}
            aria-label="Orchestra / Piano"
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
      {playlistLabel !== null ? (
        <button
          type="button"
          className="chopin"
          onClick={onTogglePlaylist}
          aria-pressed={playlistOn}
          aria-label="Just play Chopin"
          title="Just play Chopin"
        >
          <img
            src="/art/chopin-just-play-me.png"
            alt="Just play Chopin"
            width={40}
            height={40}
          />
        </button>
      ) : null}
    </>
  );
}
