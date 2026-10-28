import { buildReaderModel } from "@/core/reader";
import { loadOzBook } from "@/server/books";
import { PicturePanel } from "./picture-panel";
import { Reader } from "./reader";
import type { SceneMeta } from "./reader";

// Static server component: book text prerenders at build time. Only scene
// ids, titles, and emotion triples pass to the client container.
export default function Home() {
  const { book, scenes } = loadOzBook();
  const model = buildReaderModel(book, { scenes });
  const meta: SceneMeta[] = model.chapters.flatMap((c) =>
    c.scenes.map((s) => ({ id: s.id, title: s.title, emotion: s.emotion })),
  );

  return (
    <>
      <header className="topbar">Lectoria</header>
      <div className="shell">
        <main className="book">
          <h1>{model.title}</h1>
          <Reader scenes={meta}>
            {model.chapters.map((chapter) => (
              <div key={chapter.ch}>
                <h2>
                  Chapter {chapter.ch}: {chapter.title}
                </h2>
                {chapter.scenes.map((scene) => (
                  <section key={scene.id} data-scene-id={scene.id} aria-label={scene.title}>
                    {scene.paragraphs.map((p) => (
                      <p key={p.id} id={p.id} data-n={p.n}>
                        {p.text}
                      </p>
                    ))}
                  </section>
                ))}
              </div>
            ))}
          </Reader>
        </main>
        <aside className="companion" aria-label="Companion">
          <PicturePanel bookId={model.bookId} textVersion={model.textVersion} />
        </aside>
      </div>
    </>
  );
}
