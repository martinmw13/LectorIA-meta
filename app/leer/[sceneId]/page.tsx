import { Suspense } from "react";
import { buildReaderModel, buildSceneView } from "@/core/reader";
import { loadOzBook } from "@/server/books";
import { PicturePanel } from "../../picture-panel";
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
  return (
    <div className="shell">
      <main className="book">
        <Suspense>
          <ScenePage view={view} chapters={chapters} />
        </Suspense>
      </main>
      <aside className="companion" aria-label="Companion">
        <PicturePanel bookId={model.bookId} textVersion={model.textVersion} sceneId={sceneId} />
      </aside>
    </div>
  );
}
