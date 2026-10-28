// Single swap point for the music-mode control (style stickers plus the
// Chopin button). The player renders <MusicStyleControl /> and must not
// know its internals: replacing this file and
// app/styles/music-style-control.css swaps the whole design.
import type { MusicMode, MusicModeId } from "@/core/music";

export type MusicStyleControlProps = {
  modes: MusicMode[];
  current: MusicModeId | null;
  onAdvance: (to?: MusicModeId) => void;
};

function stickerFor(id: string, label: string): string {
  return /piano/i.test(id) || /piano/i.test(label)
    ? "/art/stickers/piano.svg"
    : "/art/stickers/violin.svg";
}

export function MusicStyleControl({ modes, current, onAdvance }: MusicStyleControlProps) {
  const styles = modes.filter((m) => m.kind === "style");
  const playlist = modes.find((m) => m.kind === "playlist") ?? null;
  return (
    <>
      {styles.length >= 2 ? (
        <span className="stickers" role="group" aria-label="Music style">
          {styles.map((s) => (
            <span className="sticker-wrap" key={s.id}>
              <button
                type="button"
                className="sticker"
                onClick={() => onAdvance(s.id)}
                aria-pressed={current === s.id}
                aria-label={s.label}
                title={s.label}
              >
                <img src={stickerFor(s.id, s.label)} alt="" width={40} height={40} />
              </button>
              <span className="sticker-dot" aria-hidden="true" />
            </span>
          ))}
        </span>
      ) : null}
      {playlist !== null ? (
        <button
          type="button"
          className="chopin"
          onClick={() => onAdvance(playlist.id)}
          aria-pressed={current === playlist.id}
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
