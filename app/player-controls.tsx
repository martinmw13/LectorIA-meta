// Player extras: Orchestra / Piano sticker buttons and the Chopin
// playlist toggle. No audio here, so the bar layout can change without
// touching the engine.
import type { StyleInfo } from "@/core/music";

function stickerFor(style: StyleInfo): string {
  return /piano/i.test(style.id) || /piano/i.test(style.name)
    ? "/art/stickers/piano.svg"
    : "/art/stickers/violin.svg";
}

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
        <span className="stickers" role="group" aria-label="Music style">
          {styles.map((s) => (
            <span className="sticker-wrap" key={s.id}>
              <button
                type="button"
                className="sticker"
                onClick={() => onStyleChange(s.id)}
                aria-pressed={styleId === s.id}
                aria-label={s.name}
                title={s.name}
                disabled={controlsDisabled}
              >
                <img src={stickerFor(s)} alt="" width={34} height={34} />
              </button>
              <span className="sticker-dot" aria-hidden="true" />
            </span>
          ))}
        </span>
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
