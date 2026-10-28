import {
  buildReaderModel,
  buildSceneView,
  PAGE_WORD_BUDGET,
  paginateScene,
  panelCaption,
  subPageCount,
} from "@/core/reader";
import { loadOzBook } from "@/server/books";
import { PANEL_ART } from "../../folio/panels";
import type { ChapterPanel } from "../../folio/panels";
import { ScenePage } from "../scene-page";

// One static route per scene. Unknown ids 404; no other scene text
// ships with this view. Page counts include the cover and end pages;
// panels carry the current chapter's short captions only.
export const dynamicParams = false;

export function generateStaticParams() {
  const { book, scenes } = loadOzBook();
  const model = buildReaderModel(book, { scenes });
  return model.chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({ sceneId: scene.id })));
}

export default async function SceneRoute({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  const { book, scenes } = loadOzBook();
  const model = buildReaderModel(book, { scenes });
  const view = buildSceneView(model, sceneId);
  // Page counts for the pager reducer: ids and numbers only, no text.
  const views = model.chapters.flatMap((chapter) =>
    chapter.scenes.map((scene, i) => ({
      sceneId: scene.id,
      pages: subPageCount(
        paginateScene(scene.paragraphs, PAGE_WORD_BUDGET, chapter.title).length,
        i === 0,
        i === chapter.scenes.length - 1,
      ),
    })),
  );
  const summaries = new Map(scenes.map((s) => [s.id, s.summary]));
  const chapter = model.chapters.find((c) => c.ch === view.ch);
  const panels: ChapterPanel[] = (chapter?.scenes ?? []).map((s) => ({
    sceneId: s.id,
    caption: panelCaption(summaries.get(s.id) ?? ""),
    art: PANEL_ART[s.id] ?? null,
  }));
  const atChapter = model.chapters.findIndex((c) => c.ch === view.ch);
  const next = atChapter >= 0 ? model.chapters[atChapter + 1] : undefined;
  const flat = model.chapters.flatMap((c) => c.scenes.map((s) => s.id));
  return (
    <ScenePage
      key={sceneId}
      view={view}
      views={views}
      bookId={model.bookId}
      textVersion={model.textVersion}
      bookIndex={flat.indexOf(sceneId)}
      bookTotal={flat.length}
      panels={panels}
      nextChapter={next ? { ch: next.ch, firstSceneId: next.scenes[0]?.id ?? "" } : null}
    />
  );
}
