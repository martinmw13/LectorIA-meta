import type { EpubBook } from "@/core/epub";
import { WORDS_PER_PAGE } from "@/core/upload-policy";

// Parsed book card: cover or a quiet serif monogram, then the facts.
export function BookCard({ book, coverUrl }: { book: EpubBook; coverUrl: string | null }) {
  const initial = book.title.trim().charAt(0).toUpperCase() || "B";
  return (
    <div className="home-card">
      {coverUrl ? (
        <img className="home-card-cover" src={coverUrl} alt="" width={72} height={72} />
      ) : (
        <span className="home-card-mono" aria-hidden="true">
          {initial}
        </span>
      )}
      <div>
        <h3 className="home-card-title">{book.title}</h3>
        <p className="home-card-meta">
          {book.author ?? "Unknown author"} · {book.chapters.length}{" "}
          {book.chapters.length === 1 ? "chapter" : "chapters"} · About{" "}
          {Math.max(1, Math.round(book.words / WORDS_PER_PAGE))} pages
        </p>
        {book.chapters.slice(0, 3).map((chapter) => (
          <p className="home-card-meta" key={chapter}>
            {chapter}
          </p>
        ))}
      </div>
    </div>
  );
}
