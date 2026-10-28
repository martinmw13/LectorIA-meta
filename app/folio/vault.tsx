// Picture Vault: the scene picture first, then inline figures in text
// order, then the drawing style picker.
"use client";

import { useState } from "react";
import { STYLE_PRESETS } from "../image-style";
import type { ImageStylePref } from "../image-style";
import { truncateCaption } from "./helpers";
import type { InlineFigure } from "./use-pictures";

function ExpandIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
    </svg>
  );
}

export function StylePicker({
  pref,
  onChange,
}: {
  pref: ImageStylePref;
  onChange: (pref: ImageStylePref) => void;
}) {
  const [custom, setCustom] = useState(pref.kind === "custom" ? pref.text : "");
  const selected = pref.kind === "custom" ? "__other" : pref.id;
  return (
    <div className="style-picker">
      <label className="mlabel" htmlFor="style-select">
        Drawing style
      </label>
      <select
        id="style-select"
        value={selected}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "__other") {
            setCustom(pref.kind === "custom" ? pref.text : "");
            return;
          }
          onChange({ kind: "preset", id: next });
        }}
      >
        {STYLE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="__other">Other…</option>
      </select>
      {selected === "__other" ? (
        <div className="style-custom">
          <input
            type="text"
            value={custom}
            maxLength={60}
            placeholder="e.g. Japanese woodblock"
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Custom drawing style"
          />
          <button
            type="button"
            disabled={custom.trim().length === 0}
            onClick={() => {
              const text = custom.trim();
              if (text.length > 0) onChange({ kind: "custom", text });
            }}
          >
            Use this style
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PictureVault({
  scene,
  figures,
  onGotoScene,
  onGotoFigure,
  onOpen,
  pref,
  onPrefChange,
}: {
  scene: { url: string; caption: string } | null;
  figures: InlineFigure[];
  onGotoScene: () => void;
  onGotoFigure: (fig: InlineFigure) => void;
  onOpen: (src: string, caption: string, opener: HTMLElement | null) => void;
  pref: ImageStylePref;
  onPrefChange: (pref: ImageStylePref) => void;
}) {
  const ready = figures.filter((f) => f.phase === "ready" && f.url !== null);
  const ordered = [...ready].sort((a, b) => a.endN - b.endN);
  return (
    <aside className="vault" aria-label="Picture Vault">
      <div className="mlabel">Picture Vault</div>
      {scene === null && ordered.length === 0 ? (
        <p className="vault-empty">Select a line you love, then choose Picture this. Your pictures will gather here.</p>
      ) : (
        <div className="vault-list">
          {scene ? (
            <button type="button" className="vault-item" onClick={onGotoScene}>
              <span className="vault-thumb">
                <img src={scene.url} alt="" />
              </span>
              <span className="vault-cap">{scene.caption}</span>
              <span className="vault-meta">
                <span className="vault-ref">This scene</span>
                <span
                  className="vault-x"
                  role="button"
                  tabIndex={0}
                  aria-label="View larger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(scene.url, scene.caption, null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onOpen(scene.url, scene.caption, null);
                    }
                  }}
                >
                  <ExpandIcon />
                </span>
              </span>
            </button>
          ) : null}
          {ordered.map((f) => (
            <button key={f.id} type="button" className="vault-item" onClick={() => onGotoFigure(f)}>
              <span className="vault-thumb">
                <img src={f.url ?? ""} alt="" />
              </span>
              <span className="vault-cap">{`\u201C${truncateCaption(f.quote)}\u201D`}</span>
              <span className="vault-meta">
                <span className="vault-ref">This scene</span>
                <span
                  className="vault-x"
                  role="button"
                  tabIndex={0}
                  aria-label="View larger"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (f.url) onOpen(f.url, f.quote, null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      if (f.url) onOpen(f.url, f.quote, null);
                    }
                  }}
                >
                  <ExpandIcon />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <StylePicker pref={pref} onChange={onPrefChange} />
    </aside>
  );
}
