// One source for the picture icon and the strings shared by the image
// pane and the inline figures. Copy stays byte-identical in both.
"use client";

export const PICTURE_COPY = {
  loading: "Sketching…",
  retry: "Try again",
  remove: "Remove picture",
} as const;

export function PictureIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" />
      <circle cx="6" cy="7" r="1.4" />
      <path d="M3.5 13 7 9.5l2.5 2.5 2-2 1 1" />
    </svg>
  );
}
