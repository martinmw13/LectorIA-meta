// The one file that owns shelf cover paths. Covers are committed
// statics under public/covers/v1, listed in cover-manifest.ts (rewritten
// by `npm run pregen:covers`). A missing cover returns null so the home
// renders the placeholder instead of a stale panel or a broken image.
import type { SkinId } from "../skin";
import { COVER_MANIFEST } from "./cover-manifest";

type Manifest = Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;

export function coverFor(
  bookId: string,
  skin: SkinId,
  manifest: Manifest = COVER_MANIFEST,
): string | null {
  return manifest[skin]?.[bookId] ?? null;
}
