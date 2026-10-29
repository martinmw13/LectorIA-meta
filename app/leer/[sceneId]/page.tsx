import { chapterPanels } from "@/core/panels";
import { buildReaderModel } from "@/core/reader";
import { loadOzBook } from "@/server/books";
import { BookView } from "../book-view";

// One static route per scene so deep links and prerendering keep working.
// Every route ships the whole book; the client scrolls to its scene.
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
  const panelsByChapter = model.chapters.map((chapter) => ({
    ch: chapter.ch,
    panels: chapterPanels(scenes.filter((s) => s.ch === chapter.ch)).map((g, i) => ({
      key: g.sceneIds[0] ?? `p${i + 1}`,
      caption: g.caption,
    })),
  }));
  return <BookView model={model} initialSceneId={sceneId} panelsByChapter={panelsByChapter} />;
}
