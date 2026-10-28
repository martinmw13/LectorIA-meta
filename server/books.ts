import "server-only";
import type { AnalyzedScene, Book } from "@/core/types";
import bookJson from "../data/books/oz/book.json";
import analysisJson from "../data/books/oz/analysis.json";

// Build-time loader for the Oz text. Static imports keep this in the
// server bundle; client components never import this module. The analysis
// records already carry every scene field, so scenes.json adds nothing.
export function loadOzBook(): {
  book: Pick<Book, "id" | "title" | "author" | "chapters" | "paragraphs" | "textVersion">;
  scenes: AnalyzedScene[];
} {
  return {
    book: bookJson as Pick<Book, "id" | "title" | "author" | "chapters" | "paragraphs" | "textVersion">,
    scenes: (analysisJson as { scenes: AnalyzedScene[] }).scenes,
  };
}
