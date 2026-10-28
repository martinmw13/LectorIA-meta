// The illustration IS the button: a small skin-matched drawing plus
// an accent label. No border, no pill background. Motion only on
// hover (:hover) and press (:active); nothing loops at rest.
"use client";

import type { PictureSkin } from "./picture-skin";

function ButtonArt({ skin }: { skin: PictureSkin }) {
  if (skin === "watercolor") {
    return (
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <path
          className="pic-btn-blob"
          d="M6 24c0-9 9-14 17-12c8 1 14 6 12 13c-2 8-12 10-19 8c-6-1-10-4-10-9z"
          fill="#9FC4FF"
          opacity="0.7"
        />
        <path d="M16 29C15 24 17 19 22 16C27 19 28 24 16 29Z" fill="#0866FF" stroke="#1F2A44" strokeWidth="1" />
        <path d="M22 16L30 2" stroke="#1F2A44" strokeWidth="3.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (skin === "ink") {
    return (
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <path d="M5 31c5-1 9-6 13-4s6 4 11 1" fill="none" stroke="#0866FF" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 12h22v14H6z" fill="none" stroke="#0866FF" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 24l6-6 4 4 3-3 6 5" fill="none" stroke="#0866FF" strokeWidth="1.4" />
        <circle cx="32" cy="11" r="2.4" fill="#0866FF" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 42 42" aria-hidden="true">
      <rect x="5" y="8" width="32" height="26" fill="#F7F1DE" stroke="#2A241C" strokeWidth="1.2" />
      <rect x="8" y="11" width="26" height="20" fill="none" stroke="#2A241C" strokeWidth="0.5" />
      <path d="M8 27l7-7 5 5 4-4 10 9" fill="none" stroke="#2A241C" strokeWidth="1" />
      {Array.from({ length: 5 }, (_, i) => (
        <path key={i} d={`M10 ${13 + i * 2.4}H32`} stroke="#2A241C" strokeWidth="0.4" opacity="0.6" />
      ))}
      <circle cx="28" cy="16" r="2.2" fill="#0866FF" />
      <g className="pic-btn-glint">
        <path d="M12 8L4 34" stroke="#FFFDF5" strokeWidth="3" opacity="0.8" />
      </g>
    </svg>
  );
}

export function PictureButton({
  skin,
  label,
  onClick,
}: {
  skin: PictureSkin;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="button" className={`pic-btn pic-btn-${skin}`} onClick={onClick}>
      <span className="pic-btn-art" aria-hidden="true">
        <ButtonArt skin={skin} />
      </span>
      <span className="pic-btn-lbl">{label}</span>
    </button>
  );
}
