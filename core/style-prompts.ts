// Approved image style prompts, owned by the server. Pure: no node
// imports, so core and app can import it directly. Unlike user custom
// text, these prompts may name their references (Denslow, Marvel,
// Studio Ghibli, Beatrix Potter, Arthur Rackham).
import type { ImageStyle, ImageStylePresetId, StyleBook } from "./image-style";

export interface StylePrompt {
  lead: string;
  composition: string;
  page: string;
  reminder: string;
  monochrome: boolean;
}

const STYLE_PROMPT_IDS = [
  "denslow",
  "watercolor",
  "pen-pencil",
  "comic",
  "graphite",
  "lantern-dusk",
] as const satisfies readonly ImageStylePresetId[];

export type StylePromptId = (typeof STYLE_PROMPT_IDS)[number];

export const STYLE_PROMPTS: Readonly<Record<StylePromptId, StylePrompt>> = {
  denslow: {
    lead: "In the style of W. W. Denslow's original 1900 color plates for The Wonderful Wizard of Oz, as a period lithographic book plate. Fine, detailed black pen-and-ink line work with confident contours, careful cross-hatching and stippling for texture and shadow; over the black linework lie flat solid areas of a few printed colors (warm yellow, brick red, leaf green, gray-blue), with slight print misregistration, on aged cream paper. Character design: Denslow's proportions, slightly large heads and expressive caricatured faces, but detailed costumes and textures (fabric patterns, folds, patches, wood grain, straw, fur), never chubby toddler shapes or dot eyes. Art Nouveau decorative touches: flowing curves, stylized flowers and vines, stylized decorative clouds and grass.",
    composition:
      "COMPOSITION (this style decides framing, not the story): staged like a turn-of-the-century illustrated plate, with clear silhouettes and balanced decorative arrangements; storms and magic become stylized ornamental swirls of hatched cloud; gray or drab places in the story are still printed in the plate's warm yellow, red, green and gray-blue.",
    page: "Art Nouveau ornamental panel borders with flowing curves and stylized flowers and vines at the corners.",
    reminder:
      "Period 1900 lithographic plate: detailed pen-and-ink hatching and stippling under a few flat printed colors, Art Nouveau ornament; no gradients, no painterly shading, no chubby toddler cartoon, no 3D, no photorealism.",
    monochrome: false,
  },
  watercolor: {
    lead: "In the style of a classic early-1900s picture-book watercolor in the manner of Beatrix Potter and Arthur Rackham: a true loose transparent watercolor painting on rough white cold-press paper. Soft wet-on-wet blooms and backruns, cauliflower edges, visible pigment granulation, colors bleeding softly into each other, generous areas of untouched white paper showing through, very faint pencil underdrawing, almost no dark contour lines: forms are defined by soft washes and edges, not outlines. Palette: soft transparent washes of sky blue, fresh greens, warm ochre and rose; gray or drab places in the story are painted as pale airy washes of blue-gray and warm ochre with lots of white paper, never heavy or muddy. Character design: delicate, gentle storybook figures with small simple faces painted in a few strokes.",
    composition:
      "COMPOSITION (this style decides framing, not the story): airy vignettes that fade out into bare paper instead of filling the frame edge to edge; storms and magic become large swirling wet washes.",
    page: "Soft loose panel shapes with irregular painted edges, separated by white paper.",
    reminder:
      "Pure loose transparent watercolor with blooms and white paper; no black ink outlines, no hard contours, no opaque paint, no flat digital color, no ruled borders, no comic look.",
    monochrome: false,
  },
  "pen-pencil": {
    lead: "A hand-drawn doodle on white lined notebook paper with faint blue ruling and a red margin line: loose blue ballpoint pen line drawing with pressure variation, scribbly cross-hatching, sketchy construction lines, light gray graphite pencil shading only for tone.",
    composition: "",
    page: "Panel borders drawn freehand and slightly wobbly in pen.",
    reminder: "Only blue ballpoint ink and gray pencil on lined paper; no paint, no markers, no other colors.",
    monochrome: false,
  },
  comic: {
    lead: "In the style of a classic Marvel comic book page: a 1970s-80s American superhero comic-book page, as if pencilled and inked for a monthly action title and printed in four colors on newsprint. Inking: heavy, dynamic black ink with confident tapered brush strokes, thick outer contours and thin interior lines, large solid black spotted shadows carving out faces, folds and forms, bold rim-light edges. Color: bright classic four-color comic printing in pure primaries: vivid red, sunny yellow, strong blue and bright green, with clean white highlights, hard-edged flat color fills and only minimal halftone; gray or drab places and people in the story are still printed in bold saturated comic colors (bright skies, vivid land, colorful clothes), never brown, sepia or desaturated. Character design: reinterpret everyone as heroic action-comic figures with strong silhouettes, expressive determined faces, wind-whipped hair and clothes; the hero is a brave adventurer in mid-motion.",
    composition:
      "COMPOSITION (this style decides framing, not the story): staged like an action comic, with dramatic low and high camera angles, extreme foreshortening, close-ups of faces and hands, figures bursting toward the viewer, diagonal energy and motion lines.",
    page: "Vary panel shapes with one wide cinematic establishing panel and dynamic angled panels, crisp white gutters and black panel borders.",
    reminder:
      "Classic American superhero action-comic art: heavy brush inks, solid black shadows, dramatic angles and foreshortening, flat bold four-color fills; not a children's storybook, not cute, no static side-on staging, no watercolor, no soft gradients, no sketchy texture, no heavy halftone dots, no muted browns, no grim desaturated palette.",
    monochrome: false,
  },
  graphite: {
    lead: "A realistic, carefully rendered graphite pencil drawing on a page of an artist's sketchbook, strictly monochrome black-and-white: HB to 8B pencils on off-white sketchbook paper with visible paper grain, tonal values built up with layered hatching and blending stump, soft smudging, eraser-lifted highlights, rich deep darks. Character design: realistic human proportions, anatomy and faces, real-looking clothing folds, realistic animals, no cartoon features. Lighting: realistic directional light with believable cast shadows and depth.",
    composition:
      "COMPOSITION (this style decides framing, not the story): framed like a realist artist's study, with natural eye-level and three-quarter views, careful perspective, parts left unfinished with faint construction lines fading into bare paper. Every element, including clothes, sky, hair and skin, is only shades of graphite gray.",
    page: "Panel borders drawn freehand in pencil.",
    reminder:
      "Strictly grayscale graphite only, realistic and finely rendered; absolutely no color, no tint, no sepia, no ink, no cartoon style, no anime, no flat fills.",
    monochrome: true,
  },
  "lantern-dusk": {
    lead: "In the style of Studio Ghibli's Spirited Away: a frame from a hand-drawn 2D Japanese animated feature, in classic cel animation. Characters: simple, slightly realistic anime proportions, ordinary everyday faces with modest eyes (not huge, not sparkly), drawn with thin clean even outlines, flat color fills and a single flat cel-shadow tone, no highlights, no gloss, no shine, no rim light. Backgrounds: calm, detailed hand-painted poster-color backgrounds with soft matte brushwork, gentle natural color palette (soft fresh greens, clear sky blue, warm wood browns, cream and soft whites) under soft clear daylight; gray in the story does not mean a gray palette: land, sky, buildings and clothes all keep gentle natural color.",
    composition:
      "COMPOSITION (this style decides framing, not the story): staged like a quiet film shot, with wide, still, eye-level framings that let small figures sit inside large detailed environments, quiet everyday moments and pauses, gentle natural poses; storms and magic are heavy soft painted clouds and shapes, not glowing vortices.",
    page: "Plain thin panel frames with white gutters.",
    reminder:
      "Flat matte 2D cel animation over calm hand-painted backgrounds: muted naturalistic pastel palette, single-tone shadows, thin outlines; no glow, no golden-hour light, no lens flares, no sparkles, no shiny highlights or reflections, no bloom, no oversaturated neon colors, no dull gray or monochrome palette, no 3D CGI, no western storybook look.",
    monochrome: false,
  },
};

// Strips hue words from the reference block for monochrome styles, so a
// blue dress in the book does not ask for blue graphite.
export function stripColorWords(text: string): string {
  const HUE =
    "red|pink|rosy|blue|bluish|green|greenish|yellow|orange|purple|violet|brown|golden|gold|crimson|scarlet|teal|turquoise|navy|tan|auburn|ginger|emerald";
  return text
    .replace(
      new RegExp(`\\b(?:${HUE})(?:-and-(?:white|black|${HUE}))?(?:-(?:checked|striped))?\\s*`, "gi"),
      "",
    )
    .replace(/\bcolou?rful\s*/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ");
}

// One trailing period: clipped book text often ends with one already.
export function sentence(t: string): string {
  const s = t.trim();
  if (/[.?!]["']?$/.test(s)) return s;
  return `${s}.`;
}

function hasPrompt(id: string): id is StylePromptId {
  return (STYLE_PROMPT_IDS as readonly string[]).includes(id);
}

// The structured prompt for a style, or undefined for the legacy
// descriptor-line path. The default is Denslow on Oz only; other books
// keep the generic line.
export function stylePromptFor(style: ImageStyle | undefined, book?: StyleBook): StylePrompt | undefined {
  if (style === undefined) {
    if (book === undefined || book.id === "oz") return STYLE_PROMPTS.denslow;
    return undefined;
  }
  if (style.kind === "preset" && hasPrompt(style.id)) return STYLE_PROMPTS[style.id];
  return undefined;
}

// Same control-char cleaning as the legacy book line.
function cleanField(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
}

// Guards every structured prompt: Oz keeps the book's own look, other
// books stay faithful to their text and period.
export function guardLine(book?: StyleBook): string {
  const head =
    book === undefined || book.id === "oz"
      ? "Characters follow the 1900 book: Dorothy wears silver shoes. Nothing from the 1939 MGM film, no ruby slippers, no film look."
      : `Faithful to the text and period of ${cleanField(book.title)} by ${cleanField(book.author)}, not any film or TV adaptation.`;
  return (
    `${head} Family-friendly, no real people, no purple. No text of any kind anywhere in the image: ` +
    "no letters, digits, captions, sound effects, speech balloons, page or panel numbers, signatures, logos or corner marks."
  );
}
