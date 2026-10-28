import Link from "next/link";
import { library, readingMinutes } from "@/core/library";

// Hero plus the grid of the other ready entries, rendered only when any.
export function Hero() {
  const favorite = library.find((book) => book.favorite) ?? library[0];
  const others = library.filter((book) => book !== favorite);
  if (!favorite) return null;
  return (
    <>
      <section className="home-hero" aria-label="Featured book">
        <img
          className="home-hero-img"
          src={favorite.cover}
          alt={favorite.coverAlt}
          width={700}
          height={700}
        />
        <div>
          <span className="home-eyebrow">★ Our favorite</span>
          <h1 className="home-title">{favorite.title}</h1>
          <p className="home-byline">
            {favorite.author} · {favorite.year} · {readingMinutes(favorite.words)}
          </p>
          <p className="home-lede">
            Every scene has its own music, picked to match what is happening on the page. Ready to
            read right now, music and all. No waiting.
          </p>
          <Link className="home-button" href={`/read/${favorite.id}`}>
            Start reading
          </Link>
        </div>
      </section>
      {others.length > 0 && (
        <section className="home-section" aria-label="More from the library">
          <h2 className="home-section-title">More from the library</h2>
          <ul className="home-grid">
            {others.map((book) => (
              <li key={book.id}>
                <Link className="home-text-button" href={`/read/${book.id}`}>
                  {book.title}
                </Link>
                <p className="home-muted">
                  {book.author} · {readingMinutes(book.words)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
