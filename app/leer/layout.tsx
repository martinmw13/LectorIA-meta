import { buildReaderModel } from "@/core/reader";
import { loadOzBook } from "@/server/books";
import { Reader } from "../reader";

// Static shell: audio and music state persist across scene routes.
// Only slim metadata reaches the client: id, chapter, emotion triple.
export default function LeerLayout({ children }: { children: React.ReactNode }) {
  const { book, scenes } = loadOzBook();
  const model = buildReaderModel(book, { scenes });
  const slim = model.chapters.flatMap((chapter) =>
    chapter.scenes.map((scene) => ({ id: scene.id, ch: chapter.ch, emotion: scene.emotion })),
  );
  return (
    <>
      <header className="topbar">Lectoria</header>
      <Reader scenes={slim}>{children}</Reader>
    </>
  );
}
