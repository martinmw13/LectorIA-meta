# Review 36 / 36b: music-style control still and frameless, and the title slot

Manager review. Merged in PR #38 (d8b5cde).

- **36 (Muse 52c5cf6):**
  - The stickers and Chopin have no box and do not animate at rest. Hover tilt and lift run inside `@media (hover:hover)`.
  - A one-shot 400 ms pop plays through `data-anim` on the mode that just became current (click or session toggle-back), skipping the first render.
  - Chopin's border, hover ring, pressed outline and scale are gone. The pressed state is the accent dot.
  - The focus ring shows on `:focus-visible` only, and reduced motion is honored. Accepted.
- **36b (Muse 45c91b1):** fixed 300 px slot with a measured marquee (`app/marquee.ts`, tested), a right fade, and a reduced-motion ellipsis with the tooltip. The source link is unchanged.
- **Fix round 1 (c7c8b4a):**
  - Reduced-motion rules no longer depend on `data-overflow`. Before, the rule toggled the inner span's display, which flipped the overflow measurement back and forth.
  - Added a 16 px padding so the end of the name clears the fade.
- **Headless checks, preview and production:**
  - Computed border, background, shadow and outline are none at rest and when pressed.
  - Running animations: 0 at rest, 2 or 3 right after a click, 0 again after 1.2 s.
  - The outline is solid only on Tab focus.
  - The icon bounding boxes are identical between a "Hi" title and a 140-character title.
  - The marquee runs only when the title overflows. Reduced motion: animation none, mask none.
