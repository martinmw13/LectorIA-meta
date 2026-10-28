import { redirect } from "next/navigation";
import { buildReaderModel } from "@/core/reader";
import { loadOzBook } from "@/server/books";

// The book opens at its first scene. Scene ids are the addresses.
export default function Home() {
  const { book, scenes } = loadOzBook();
  const model = buildReaderModel(book, { scenes });
  const first = model.chapters[0]?.scenes[0];
  redirect(`/leer/${first?.id ?? ""}`);
}
