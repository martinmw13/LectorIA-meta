import { buildReaderModel, buildSceneView, paginateScene } from "@/core/reader";
import { loadOzBook } from "@/server/books";
import { ScenePage } from "../scene-page";

// One static route per scene. Unknown ids 404; no other scene text
// ships with this view.
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
  const chapters = model.chapters.map((chapter) => ({
    ch: chapter.ch,
    title: chapter.title,
    firstSceneId: chapter.scenes[0]?.id ?? "",
  }));
  // Page counts for the pager reducer: ids and numbers only, no text.
  const views = model.chapters.flatMap((chapter) =>
    chapter.scenes.map((scene) => ({ sceneId: scene.id, pages: paginateScene(scene.paragraphs).length })),
  );
  return (
    <div className="shell">
      <main className="book">
        <ScenePage
          key={sceneId}
          view={view}
          chapters={chapters}
          views={views}
          bookId={model.bookId}
          textVersion={model.textVersion}
        />
      </main>
    </div>
  );
}
