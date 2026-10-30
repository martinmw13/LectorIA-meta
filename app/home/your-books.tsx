"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadMyBooks, removeMyBook, type MyBook } from "./my-books";

// Books this browser finished uploading: links back to the reader.
// Loads after mount so the server render matches everywhere.
export function YourBooks() {
  const [books, setBooks] = useState<MyBook[] | null>(null);

  useEffect(() => {
    setBooks(loadMyBooks());
  }, []);

  if (!books || books.length === 0) return null;
  return (
    <section aria-label="Your books">
      <h2 className="ob-sec-t">Your books</h2>
      <ul className="ob-mine">
        {books.map((entry) => (
          <li key={entry.id} className="ob-mine-row">
            <Link className="ob-action" href={`/read/${entry.id}`}>
              {entry.title}
            </Link>
            <span className="ob-mini-meta">{entry.author}</span>
            <button
              type="button"
              className="ob-quiet"
              aria-label={`Forget ${entry.title}`}
              onClick={() => setBooks(removeMyBook(entry.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
