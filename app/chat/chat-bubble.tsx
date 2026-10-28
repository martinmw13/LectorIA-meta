// Launcher bubble art. The tail sits at the bottom right, coming from the
// right margin, so the bubble opens toward the page. Each skin restyles the
// same paths in app/styles/chat.css (outline, wash, dashes, offset shadow).
const BUBBLE =
  "M38 6H8a6 6 0 0 0-6 6v14a6 6 0 0 0 6 6h18l9 7v-7h3a6 6 0 0 0 6-6V12a6 6 0 0 0-6-6z";

export function ChatBubble({ open }: { open: boolean }) {
  return (
    <svg className="chat-bub" viewBox="0 0 46 42" aria-hidden="true">
      <path className="bub-body" d={BUBBLE} />
      <path className="bub-inner" d={BUBBLE} transform="translate(3.2 3) scale(.86)" />
      {open ? (
        <path
          className="bub-glyph"
          d="M16 17l7 6 7-6"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <g className="bub-glyph" fill="currentColor">
          <circle cx="15" cy="19" r="2.1" />
          <circle cx="23" cy="19" r="2.1" />
          <circle cx="31" cy="19" r="2.1" />
        </g>
      )}
    </svg>
  );
}
