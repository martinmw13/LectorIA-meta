"use client";

import { useRef, type KeyboardEvent } from "react";
import { setSkin, SKINS } from "../skin";
import { useSkin } from "../use-skin";
import { SKIN_NAMES } from "../style-menu";
import "./style-picker.css";

// The home's visible style chooser: one small swatch per skin, cut from
// that skin's own home painting. A radio group, so arrows move the
// choice and Tab enters on the live skin. setSkin stays the only writer
// of data-skin, same as the top-right menu.
export function StylePicker() {
  const skin = useSkin();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const at = SKINS.indexOf(skin);
    const n = SKINS.length;
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      Home: 0,
      End: n - 1,
    };
    const to = moves[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const i = ((to % n) + n) % n;
    setSkin(SKINS[i]!);
    refs.current[i]?.focus();
  }

  return (
    <div className="sp" role="radiogroup" aria-labelledby="spTitle">
      <p className="sp-t" id="spTitle">
        Pick your style
      </p>
      <div className="sp-row">
        {SKINS.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={s === skin}
            tabIndex={s === skin ? 0 : -1}
            className="sp-item"
            data-skin-option={s}
            onClick={() => setSkin(s)}
            onKeyDown={onKey}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a 4 KB static swatch, already sized; next/image would add a loader for nothing. */}
            <img className="sp-sw" src={`/art/skins/${s}/swatch.jpg`} alt="" width={64} height={40} decoding="async" />
            <span className="sp-name">{SKIN_NAMES[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
