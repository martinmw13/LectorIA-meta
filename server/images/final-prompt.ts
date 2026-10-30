import "server-only";
import { buildPrompt } from "@/core/images";
import type { ImageStyle, StyleBook } from "@/core/image-style";
import { buildChapterPrompt, chapterPanels } from "@/core/panels";
import { classifyInputOf } from "@/core/fingerprint";
import type { ImageKind, Scene } from "@/core/types";
import { chapterReference, getBookmap } from "./bookmap-prompt";

// Final prompt assembly, shared by the route and pregen so a stored
// page always matches what the route would generate for its key.
export function buildFinalPrompt(args: {
  kind: ImageKind;
  passageText: string;
  sceneTitle: string;
  sceneClip: string;
  chapterPanels?: { description: string }[];
  style?: ImageStyle;
  book?: StyleBook;
  reference?: string;
}): string {
  // The builders place the reference: structured prompts put it before
  // the style reminder, legacy ones append it at the end.
  return args.kind === "chapter"
    ? buildChapterPrompt({
        chapterTitle: args.sceneTitle,
        panels: args.chapterPanels ?? [],
        style: args.style,
        book: args.book,
        reference: args.reference,
      })
    : buildPrompt({
        kind: args.kind,
        passageText: args.passageText,
        sceneTitle: args.sceneTitle,
        sceneClip: args.sceneClip,
        style: args.style,
        book: args.book,
        reference: args.reference,
      });
}

// Chapter prompt exactly as the route builds it: panels over the
// chapter's scenes plus the chapter reference block. Pregen calls this
// so first-write-wins Blob pages match the route byte for byte.
export function buildPregenChapterPrompt(args: {
  book: {
    id: string;
    title: string;
    author: string;
    textVersion: string;
    chapters: { ch: number; title: string }[];
  };
  scenes: Scene[];
  ch: number;
  style?: ImageStyle;
}): string {
  const chapterScenes = args.scenes.filter((s) => s.ch === args.ch);
  const reference = chapterReference({
    bookmap: getBookmap(args.book.id, args.book.textVersion, classifyInputOf(args.scenes, args.book.textVersion)),
    sceneIds: chapterScenes.map((s) => s.id),
    ch: args.ch,
  });
  return buildFinalPrompt({
    kind: "chapter",
    passageText: "",
    sceneTitle: args.book.chapters.find((c) => c.ch === args.ch)?.title ?? "",
    sceneClip: "",
    chapterPanels: chapterPanels(chapterScenes),
    style: args.style,
    book: { id: args.book.id, title: args.book.title, author: args.book.author },
    reference,
  });
}
