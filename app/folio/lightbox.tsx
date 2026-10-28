// One shared lightbox for pane, figures, and vault. Focus moves in
// and returns to the opener on close.
"use client";

import { useEffect, useRef } from "react";
import type { LightboxItem } from "./use-pictures";

export function Lightbox({
  item,
  onClose,
}: {
  item: LightboxItem | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (item) closeRef.current?.focus();
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Picture viewer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button ref={closeRef} type="button" className="lightbox-x" onClick={onClose} aria-label="Close">
        ×
      </button>
      <img className="lightbox-img" src={item.src} alt={item.caption} />
      <p className="lightbox-cap">{item.caption}</p>
    </div>
  );
}
