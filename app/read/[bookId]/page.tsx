import { redirect } from "next/navigation";
import { buildReaderModel } from "@/core/reader";
import { loadBook } from "@/server/books";

// The book opens at its first scene. Scene ids are the addresses.
// Unknown or unlisted books 404 inside loadBook, before any redirect.
export default async function ReadBook({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const { book, scenes } = await loadBook(bookId);
  const model = buildReaderModel(book, { scenes });
  const first = model.chapters[0]?.scenes[0];
  redirect(`/read/${bookId}/${first?.id ?? ""}`);
}
