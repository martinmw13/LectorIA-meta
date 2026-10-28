Implement task 16 (Folio reader redesign) on branch `folio-reader` in this workspace. Read AGENTS.md and SECURITY.md first. The spec below is binding. Write `docs/tasks/16-folio-reader.md` (what changed and why, at most 50 lines, plus the copy table from section 9) as your first commit.

Skills to apply (read `.agents/skills/<name>/SKILL.md` directly): ponytail (full, in AGENTS.md), typescript-best-practices, principle-subtract-before-you-add, principle-test-behavior-not-implementation, react rules of hooks, unslop.

Rules: small logical commits with plain messages (the hook adds the Muse trailer), no --no-verify, no push. Do NOT start a server (`next start`/`next dev` hang in this sandbox). Every file stays under the 5000-token hook (split CSS and components into several files: e.g. `app/folio/*.tsx`, `app/styles/*.css` imported from globals.css).

## Design reference (read before coding)

`.proto/v3/03-folio-margin.html` is the approved prototype (static HTML, mock data). Screenshots: `.proto/v3/03-folio-margin-{default,dark,gallery,hover,pt,revealed,dev}.png`. Assets in `.proto/assets/`. Port its look faithfully into the real Next.js app: layout, typography, spacing, colours, motion, icons (inline SVG, `currentColor`). Do not copy its mock data, its prototype switcher pill, its `?pt/?gallery/?hover/?panels/?recap` helpers, or its "Chapter in panels" tile and modal (task 17 builds panels). Keep `?dev` and Shift+D.

## Hard constraints

- Do not modify `core/music-session.ts`, `core/music-schedule.ts`, `core/music-selection.ts`, `core/music-similarity.ts`, `core/music-*.ts` logic, or the audio logic inside `app/player.tsx` (refs, effects, crossfade, gain). You may change Player's JSX markup and classes and its props only where layout needs it. The reader's `send(...)` intents stay as they are.
- Do not modify `server/images/*` (another worker is editing it). You may change the user-facing message constants in `core/images.ts` (section 9) and the tests that pin them.
- Do not touch `public/music/`, `data/`, the CSP except adding nothing (fonts must be self-hosted via `next/font/google`, which satisfies `font-src 'self'`).
- Never send selected text to the server: requests keep sending ordinals and ids only (existing `pickStartN` path). The selected text may stay in client memory for captions.
- No purple anywhere. Meta blue `#0866FF` accent, `#0064E0` hover; dark mode keeps the accent (`#2D88FF` is allowed for dark-mode accent text on `#0B1215` if contrast needs it). Update `app/tokens.css` (source of truth) with light and dark values; dark applies when `<html data-theme="dark">`, and with no stored choice follows `prefers-color-scheme`.
- English UI only. No scene names anywhere in the UI (drop the scene `<h2>` title): the heading is the chapter.
- Motion under 200 ms except the hover expand (about 260 ms), all disabled under `prefers-reduced-motion`.
- Desktop only, design for 1280x800 and 1440x900. At 1280x800 the body never scrolls; the top line and bottom band are always visible; the reading column scrolls inside itself when a page is taller.

## 1. Shell

- Fonts: Newsreader (book text and headings) and Instrument Sans (UI) via `next/font/google`, exposed as CSS variables used by tokens.
- Top line: wordmark `LECTORIA` (letterspaced), centre `The Wonderful Wizard of Oz · L. Frank Baum · Chapter N of 24` where "Chapter N of 24" is a quiet chapter jump (a native `<select>` styled as text is fine; it replaces the old bottom chapter select; options read `1. The Cyclone`), right: theme toggle (moon icon in light, sun in dark, `aria-label` "Dark mode"/"Light mode", `aria-pressed`). Theme persists in localStorage `lectoria.theme`; a tiny inline script in `app/layout.tsx` sets `data-theme` before paint (the CSP already allows inline scripts) and `suppressHydrationWarning` on `<html>`.
- Main: three columns like the prototype. Left image pane (default 30% width, resizable divider: drag, keyboard arrows on the focused divider with `role="separator"` and `aria-valuenow`, min 220 px, max 46vw, double-click resets, persisted in localStorage `lectoria.split`). Centre reading column about 60ch. Right margin 200 px: the Picture Vault (section 5).
- Chapter heading block per scene page: a small kicker `Chapter 1` (uppercase, letterspaced), then the chapter title large in Newsreader (`The Cyclone`), then muted `Scene 2 of 4` (add ` · Page 1 of 3` only when the scene has several pages). Never print the chapter title twice. Blue drop cap on the scene's first paragraph on page 1.
- Bottom folio band, one row: scene pager `‹ Scene 2 of 4 ›` (icon buttons `aria-label` "Previous page"/"Next page", arrows keys keep working) above a thin book progress of 133 ticks with the current scene filled in accent and the caption `Scene 2 of 133` muted; then the player: ⏮ ▶/⏸ ⏭ icon buttons as today, a speaker icon that mutes/unmutes (`aria-label` "Mute"/"Unmute", icon shows muted state), the volume slider, the now-playing line (`Symphony No. 6 – IV · Tchaikovsky ·` then the source as a link with a small ↗ arrow icon when the manifest gives a URL), then the style stickers (section 7), then the Chopin "Just play me" PNG button exactly as today.
- Layout plumbing: the player lives in the `/leer` layout (`app/reader.tsx`) and the pager in the route (`app/leer/scene-page.tsx`). Keep that split (music state must persist across scene routes). Use one CSS grid on a wrapper rendered by Reader, with `display: contents` on the route wrappers, so the route's pager and columns land in their grid areas; or another approach that keeps the split and needs no portal. The dev panel (section 8) needs the current scene's emotion and the current track: Reader already has both.

## 2. Left image pane and Picture scene

- Default: the anti-spoiler paper-grain placeholder from the prototype (pure CSS, no image) with a centred pill button `Picture this scene` (icon + text). Pressing it calls the existing `illustrateScene`. Loading: shimmer plus the label `Sketching…` (role status). Ready: the image fades in (`object-fit: cover`, top aligned) filling the pane, with a tiny caption strip and a × to put the placeholder back. Error: the message in the pane with a `Try again` text button.
- Hover to expand: when the pointer rests 250 ms on the revealed image (no click), it expands with a transform transition (about 260 ms) to its natural aspect ratio centred over the layout (max 72vw x 78vh, soft shadow, faint dim behind it; text stays visible); leaving it returns it to the pane. Reduced motion: instant. Click (expanded or not) opens the lightbox.
- The scene image persists for that scene for the session (module-level client cache keyed by scene id), so leaving a scene and coming back shows it again without a request.

## 3. Picture this, inline

- Keep the popover behaviour (mouseup after a frame, trimmed selection ≥ 3 chars inside the reading text, 8 px above the selection centre, dismissed by outside mousedown, Escape, page or scene change, or starting a request). Label `Picture this`.
- On click, insert a figure right after the paragraph where the selection ENDS (the later paragraph in reading order; use `n`, never id strings). Loading: a 4:3 placeholder of text width with a subtle shimmer and `Sketching…`. Ready: image fades in, caption is the selected text in curly quotes, truncated at about 80 chars with an ellipsis, then a small muted credit `In the style of W. W. Denslow` (or the chosen style, section 6). Each figure has a small × (`aria-label` "Remove picture"). Errors show inline in the same slot with `Try again`.
- Several figures per scene are allowed; one request at a time. Figures belong to their scene and persist in client memory for the session (module-level map keyed by scene id), surviving sub-page and scene changes. A figure shows on the sub-page that holds its paragraph.
- Click on an inline image opens the lightbox.

## 4. Lightbox

One shared modal: dim backdrop, image at natural ratio (max 92vw x 88vh), caption below, × button, Escape and click outside close, focus moves into it and returns to the opener, `role="dialog"` `aria-modal`. Used by the pane image, inline figures and the Picture Vault.

## 5. Picture Vault (right margin)

- Heading `Picture Vault` (small caps style like the prototype's margin headings). Lists the current scene's pictures: the scene picture first if revealed, then inline figures in text order. Each entry: 4:3 thumbnail, the quote caption in italic (the scene picture's caption is the API caption), and an expand icon button (`aria-label` "View larger") that opens the lightbox. Clicking the entry itself goes to the sub-page holding that figure, scrolls it into view and pulses it briefly (outline in accent, 600 ms, none under reduced motion).
- Empty state, muted small text: `Select a line you love, then choose Picture this. Your pictures will gather here.`
- Below the list, the image style picker (section 6).

## 6. Image style picker (UI only, contract stub)

- Small, discreet control under the Picture Vault list: label `Drawing style`, a native `<select>` styled quietly with presets: `Denslow ink (1900)` (default), `Watercolour`, `Pencil sketch`, `Woodcut`, `Storybook gouache`, `Other…`. Choosing `Other…` reveals a short text input (`placeholder="e.g. Japanese woodblock"`, maxLength 60, trimmed, required non-empty to apply) with a small `Use this style` button.
- Sticky: persisted in localStorage `lectoria.imageStyle` as `{ kind: "preset", id } | { kind: "custom", text }`, parsed defensively (bad or old values fall back to the default). Applies to all new pictures until changed; existing pictures keep theirs.
- The backend contract is not on main yet (another worker adds a `style` field to the `/api/images` request, documented later in docs/contracts.md). Put all of this in `app/image-style.ts` with one adapter `requestStyleFields(pref): Record<string, never>` that returns `{}` for now with the comment `shortcut: style not sent until the /api/images style contract lands; wire it here`. Request bodies spread its result, so wiring later is a one-function change. Test the parse and persistence (pure functions).
- The credit line under figures uses the style the picture was requested with (`In the style of W. W. Denslow` for the default; `Watercolour` etc.; custom: `In your style: <text>`). Note: since the style is not sent yet, keep the credit as the Denslow line unless the adapter sends a style (derive it from the same adapter so it never lies).

## 7. Style stickers (Orchestra / Piano)

Replace the Orchestra / Piano segmented control with two sticker buttons like the Chopin "Just play me" button: `public/art/stickers/violin.svg` for Orchestra and `public/art/stickers/piano.svg` for Piano (Noto Emoji, Apache-2.0, already committed, credits in `public/art/SOURCES.md`). Each is an `<img alt="">` inside a `<button>` with `aria-label` "Orchestra" / "Piano", `title` "Orchestra" / "Piano", `aria-pressed` for the selected one. Look: about 34 px art, white die-cut outline (stacked `drop-shadow(0 0 0 #fff)` style filters or an SVG/CSS outline, 2 px), soft shadow, slight tilt (-6deg and +5deg), playful hover (straighten and lift 1 px, under 150 ms). Selected: straight, full colour, and a small Meta-blue dot or underline below it; unselected: slightly desaturated (`filter: saturate(.6)`) and 85% opacity. Keep the same behaviour as today (style switch only shows when two styles have tracks; `onStyleChange`). Dark mode keeps the white outline.

## 8. Developer view (hidden)

Nothing in normal mode hints at it. Opened by Shift+D (not while typing in an input) or `?dev` in the URL; Escape or × closes. Compact floating panel bottom-right above the band (320 px, monospace numbers, small `DEV` tag): the current scene's 8 emotion bars sorted descending (English labels: calm, joy, sadness, suspense, mystery, adventure, combat, wonder; top one in accent), intensity and tempo, and the current track title. Read-only from data Reader already has. No mood or emotion word anywhere else in the UI.

## 9. Copy pass (warm, short, human)

Every user-facing string, warm and plain, never technical, never the word "Generated", each phrase said once. Use these (and apply the same tone to any string not listed); put a before/after table of every changed string in the task doc:

| Where | Before | After |
|---|---|---|
| Scene picture button | Picture scene | Picture this scene |
| Loading | Illustrating… | Sketching… |
| Picture flag | New / Saved | (removed) |
| Dismiss | Dismiss image | Remove picture |
| Music failed note | Music unavailable. The reader works without it. | The music is resting. The book is all yours. |
| MSG_BAD_REQUEST | That request was not valid. Try again. | Something went wrong there. Try again? |
| MSG_QUOTA | You reached your limit of 5 images per day. Come back tomorrow. | That's all five pictures for today. More tomorrow. |
| MSG_BUDGET | The generation limit was reached. Try again later. | The sketchbook is full for now. Try again a little later. |
| MSG_UNAVAILABLE | Images are unavailable right now. | Pictures aren't available right now. |
| MSG_FAILED | Could not generate the image. Try again. | That picture didn't come out. Try again? |
| MSG_RETRY | The image is taking longer than expected. Try again. | This one is taking a while. Try again in a moment. |
| Gallery | (new) | Picture Vault |
| Gallery empty | (new) | Select a line you love, then choose Picture this. Your pictures will gather here. |

Update every test and doc (docs/contracts.md, AGENTS.md only where it pins old copy) that pins those strings.

## 10. Cleanup

Delete CSS and components that the redesign replaces (old topbar, scene-nav, picture-slot, chapter select at the bottom). Keep `pickStartN` and its tests. Add pure helpers only where logic is non-trivial (caption truncation, figure placement by end paragraph, split clamp, style pref parse) with small behaviour tests.

## Finish

Update docs/contracts.md (reader UI surface, picture vault, style pref stub) and BUILT_DURING_HACKATHON.md (task 16). Run and report: `npm test` (count), `npx next typegen`, `npm run typecheck`, `npm run build`, `npm run check:isolation`, `npm run test:hooks`, `npm run check:size`, `node scripts/check-secrets.mjs --all`. Then `grep -rnE "Generated|generated" app --include=*.tsx` must show no user-facing hit, and `grep -rniE "purple|violet|#[0-9a-f]{0,2}(8a2be2|800080)" app` must be empty. End with a short summary: files changed, what you skipped, risks.
