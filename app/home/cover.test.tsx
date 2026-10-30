// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverImage } from "./cover";

describe("CoverImage", () => {
  test("shows the cover with the book title as alt text", () => {
    const html = renderToStaticMarkup(
      <CoverImage title="Alice's Adventures in Wonderland" url="/covers/v1/comic/alice.webp" />,
    );
    expect(html).toContain("<img");
    expect(html).toContain('alt="Alice&#x27;s Adventures in Wonderland"');
    expect(html).toContain('src="/covers/v1/comic/alice.webp"');
  });

  test("falls back to title typography while the cover is missing", () => {
    const html = renderToStaticMarkup(<CoverImage title="Dracula" url={null} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("ob-cover-fallback");
    expect(html).toContain("Dracula");
  });

  test("keeps the frame class on the fallback so the layout does not shift", () => {
    const html = renderToStaticMarkup(<CoverImage title="Oz" url={null} className="ob-art" />);
    expect(html).toContain('class="ob-art ob-cover-fallback"');
  });
});
