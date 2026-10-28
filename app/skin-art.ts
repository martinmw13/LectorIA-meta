// Hero art for the player buttons, per skin: the illustrated Orchestra,
// Piano, Just Chopin! and Read aloud buttons from the approved skin
// prototypes (public/art/skins/<skin>/). A skin without its own art here
// keeps the default stickers and line icon.
import type { SkinId } from "./skin";

export type HeroArt = { orchestra: string; piano: string; chopin: string; narrate: string };

const HERO: Partial<Record<SkinId, HeroArt>> = {
  engraving: {
    orchestra: "/art/skins/engraving/orchestra.svg",
    piano: "/art/skins/engraving/piano.svg",
    chopin: "/art/skins/engraving/chopin.svg",
    narrate: "/art/skins/engraving/narrate.svg",
  },
  watercolor: {
    orchestra: "/art/skins/watercolor/orchestra.svg",
    piano: "/art/skins/watercolor/piano.svg",
    chopin: "/art/skins/watercolor/chopin.svg",
    narrate: "/art/skins/watercolor/narrate.svg",
  },
  ink: {
    orchestra: "/art/skins/ink/orchestra.svg",
    piano: "/art/skins/ink/piano.svg",
    chopin: "/art/skins/ink/chopin.svg",
    narrate: "/art/skins/ink/narrate.svg",
  },
};

export function heroArt(skin: SkinId): HeroArt | null {
  return HERO[skin] ?? null;
}
