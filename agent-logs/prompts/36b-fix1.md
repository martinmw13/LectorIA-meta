# Task 36b fix round 1 (review findings)

Same branch `music-still`. Follow AGENTS.md. Only touch `app/styles/player.css`, plus `app/player.tsx` if strictly needed.

1. **Bug: reduced motion makes the overflow flag flap.** Under reduced motion, the rules keyed on `[data-overflow="1"]` set the inner span to `display: block`. Its width then equals the slot, so the measured shift becomes 0, the ResizeObserver removes `data-overflow`, and the inner span returns to `inline-block`. The shift becomes >0 again, and the loop repeats.
   - Fix: under `prefers-reduced-motion: reduce` and under `.player[data-reduced-motion="true"]`, apply the static ellipsis (`display: block; overflow: hidden; text-overflow: ellipsis; animation: none; transform: none`) to `.player-track-inner` unconditionally, not keyed on `data-overflow`. Keep `mask-image: none` there too.
   - The flag may then simply stay absent in reduced mode, and that is fine.
2. **The right fade hides the end of the name at the scrolled end.** When overflowing, give the inner span `padding-right: 16px`, the same as the fade width, so the last characters clear the fade at the end pause. The measurement already uses `scrollWidth`, so the shift includes the padding.

Run `npx vitest run` and `npx tsc --noEmit`, then commit with the message `Keep reduced-motion title static and clear the fade`. Report in 2 lines.
