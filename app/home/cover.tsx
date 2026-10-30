// Shelf cover image with a quiet typographic fallback. While a cover is
// missing the card keeps its shape (same 3:4 frame) and prints the book
// title on a paper tone, so switching skins never shifts the layout.
export function CoverImage({
  title,
  url,
  className,
  eager,
}: {
  title: string;
  url: string | null;
  className?: string;
  eager?: boolean;
}) {
  if (!url) {
    return (
      <span className={className ? `${className} ob-cover-fallback` : "ob-cover-fallback"} aria-hidden="true">
        <span className="ob-cover-title">{title}</span>
      </span>
    );
  }
  return (
    <img
      className={className}
      src={url}
      alt={title}
      loading={eager ? undefined : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
    />
  );
}
