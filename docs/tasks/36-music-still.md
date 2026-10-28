# Task 36: Music-style control stays still and frameless

## What changed

- `app/folio/music-style-control.tsx` drives a one-shot pop with a
  short-lived `data-anim="1"` on the button whose mode just became
  current, from a `useEffect` on `current` that skips the first render
  and clears its 450 ms timeout on unmount and rapid changes. The
  Chopin button sits in a `.sticker-wrap` with a `.sticker-dot`, like
  the stickers. Props, callbacks, labels, and pressed semantics read
  the same.
- `app/styles/music-style-control.css` keeps rest still (no loops),
  moves hover tilt and lift inside `@media (hover: hover)`, adds the
  400 ms pop keyframes behind `[data-anim]`, removes every Chopin
  border, background, shadow, and pressed outline ring, matches
  inactive Chopin to inactive stickers, and limits outlines to
  `:focus-visible`, all off under reduced motion.
- `app/folio/music-style-control.test.ts` pins the contract at source
  level, like `app/rain-button.test.ts`.

## Why

Same owner rule as the rain button: the icons are the buttons, still
at rest, with motion only on hover and one pop on change.

## Checks

`npx vitest run`, `npx tsc --noEmit`.
