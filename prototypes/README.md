# Folio v3 prototypes (throwaway)

Question: which reader layout should the Folio redesign build on?

Three static HTML variants, mock data only, desktop 1280x800. Open
`v3/index.html` in a browser. URL flags: `?dark`, `?dev`, `?pt`,
`?gallery`, `?hover`, `?panels`, `?recap`, `?scene=N`.

- `v3/01-folio-carousel.html`: panels entry next to the chapter heading.
- `v3/02-folio-pages.html`: panels button in the bottom-left corner.
- `v3/03-folio-margin.html`: right margin with a panels tile and the image list.

Verdict (Martin, 2026-10-28): build on 03 (Folio margin). Additions:
a chapter cover before each chapter's first scene with a spoiler-gated
"Chapter in panels" offer, a "Relive this chapter in panels" card at the
chapter end, "Picture scene / Picture chapter" paired in other scenes,
no numbered circles on panels, and "Illustrations" instead of
"Generated images".

This branch is reference only and is never merged. `_work/` holds the
prompts that produced each variant; `screenshots/` holds their captures.
