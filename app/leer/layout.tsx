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
  const chapters = model.chapters.map((chapter) => ({
    ch: chapter.ch,
    title: chapter.title,
    firstSceneId: chapter.scenes[0]?.id ?? "",
  }));
  return (
    <Reader scenes={slim} chapters={chapters} bookTitle={model.title} bookAuthor={model.author}>
      {children}
    </Reader>
  );
}
