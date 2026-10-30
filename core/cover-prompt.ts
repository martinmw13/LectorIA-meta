// Shelf cover prompts. Pure: no node imports, no env reads, no network.
// One portrait cover per shelf book per skin, painted in the skin's own
// image style with the same guards the chapter panels use.
import { SKIN_DEFAULT_IMAGE_STYLE, parseStyleChoice } from "./image-style";
import type { ImageStyle, ImageStylePresetId, StyleBook } from "./image-style";
import { clipText, referencePart, styleLine } from "./images";
import { guardLine, sentence, stylePromptFor } from "./style-prompts";

export const COVER_VERSION = "v1" as const;
export const COVER_DESC_CHARS = 300;
export const COVER_EXT = "webp" as const;

// The six skin default styles: one cover set per skin.
export const COVER_SKINS = Object.keys(SKIN_DEFAULT_IMAGE_STYLE);

export function isCoverSkin(skin: string): boolean {
  return Object.hasOwn(SKIN_DEFAULT_IMAGE_STYLE, skin);
}

// Parsed style for a skin. Undefined means the default (denslow on Oz),
// exactly like the route treats an omitted style.
export function coverStyleForSkin(skin: string): ImageStyle | undefined {
  if (!isCoverSkin(skin)) return undefined;
  return parseStyleChoice({ preset: SKIN_DEFAULT_IMAGE_STYLE[skin] as ImageStylePresetId });
}

// Committed static path. The versioned path is the cache key: a new
// prompt version ships under a new version, never by overwriting.
export function coverPublicPath(skin: string, bookId: string): string {
  return `/covers/${COVER_VERSION}/${skin}/${bookId}.${COVER_EXT}`;
}

export function coverDiskPath(skin: string, bookId: string): string {
  return `public${coverPublicPath(skin, bookId)}`;
}

// Bookmap text is LLM-derived, so the same control-char cleaning the
// panel prompts apply. Clipped, never echoed raw into the prompt.
export function cleanCoverText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}

// Image safety filters reject literal nudity words even for a
// loincloth-clad Mowgli, so covers soften them before prompting.
export function softenCoverText(value: string): string {
  return value.replace(/\b(?:naked|nude|unclothed)\b/gi, "loincloth-clad");
}

export function coverSubject(coverDescription: string, monochrome: boolean): string {
  const clipped = clipText(softenCoverText(cleanCoverText(coverDescription)), COVER_DESC_CHARS);
  const stripped = monochrome ? referencePart(clipped, true).trim() : clipped;
  const text = stripped.length > 0 ? stripped : "an iconic scene from the book";
  return sentence(text);
}

// Portrait cover art in the skin's style. The title stays off the image;
// the shelf card prints it below the art.
export function buildCoverPrompt(args: {
  book: StyleBook;
  coverDescription: string;
  style: ImageStyle | undefined;
}): string {
  const prompt = stylePromptFor(args.style, args.book);
  const subject = coverSubject(args.coverDescription, prompt?.monochrome === true);
  const noTitle =
    "The cover carries no title and no words of any kind: no letters, digits, captions, signatures, logos or corner marks anywhere in the image.";
  if (prompt !== undefined) {
    return [
      `STYLE: ${prompt.lead}`,
      prompt.composition,
      `CONTENT: Portrait book-cover illustration, aspect ratio 3:4, full-bleed art with no border and no frame. Subject: ${subject}`,
      `STYLE REMINDER: the whole cover is drawn in this one style. ${prompt.reminder}`,
      guardLine(args.book),
      noTitle,
    ]
      .filter((p) => p !== "")
      .join(" ");
  }
  return (
    `Portrait book-cover illustration, aspect ratio 3:4, full-bleed art with no border and no frame. ` +
    `Subject: ${subject} ${styleLine(args.style, args.book)} ${guardLine(args.book)} ${noTitle}`
  );
}
