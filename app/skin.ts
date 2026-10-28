// The current skin has one runtime owner: this module. Every skin-dependent
// surface (icons, read-along highlight, Picture this animations, image style,
// button animations) reads from here via getSkin/subscribe or useSkin (see
// app/use-skin.ts), or via CSS keyed on `html[data-skin]`. Nothing else may
// write data-skin: setSkin/cycleSkin are the only writers, called by the
// future home cycling button / skin switcher.
export const SKINS = ["engraving", "watercolor", "ink", "pencil", "chihiro"] as const;
export type SkinId = (typeof SKINS)[number];
// Denslow fits Oz; the default until a skin switcher exists.
export const DEFAULT_SKIN: SkinId = "engraving";

export function isSkinId(v: unknown): v is SkinId {
  return (SKINS as readonly unknown[]).includes(v);
}

export const SKIN_KEY = "lectoria.skin";

// Pure: a valid `?skin=` in search wins, else a valid stored value, else the
// default. Anything else is ignored. The inline script below must stay in sync
// with this (it cannot import this module).
export function initialSkin(stored: unknown, search?: string): SkinId {
  try {
    if (typeof search === "string" && search) {
      const q = new URLSearchParams(search).get("skin");
      if (isSkinId(q)) return q;
    }
  } catch {
    // Malformed search string: fall through to the stored value.
  }
  return isSkinId(stored) ? stored : DEFAULT_SKIN;
}

// Pre-first-paint inline script, rendered in layout.tsx next to THEME_SCRIPT.
// Applies the same rule as initialSkin to document.documentElement data-skin;
// try/catch falls back to the default. The `?skin=` override applies to that
// load only and is NOT written to storage.
export const SKIN_SCRIPT = `(function(){try{var l=${JSON.stringify(SKINS)};var d=${JSON.stringify(DEFAULT_SKIN)};var q=null;try{q=new URLSearchParams(location.search).get("skin");}catch(e){}if(l.indexOf(q)>=0){document.documentElement.dataset.skin=q;return;}var s=null;try{s=localStorage.getItem(${JSON.stringify(SKIN_KEY)});}catch(e){}document.documentElement.dataset.skin=l.indexOf(s)>=0?s:d;}catch(e){try{document.documentElement.dataset.skin=${JSON.stringify(DEFAULT_SKIN)};}catch(_){}}})();`;

type SkinListener = () => void;

const listeners = new Set<SkinListener>();
let storageHooked = false;

function notify(): void {
  for (const cb of listeners) cb();
}

function hookStorage(): void {
  if (storageHooked) return;
  try {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener("storage", (e) => {
      if (e.key !== SKIN_KEY || !isSkinId(e.newValue)) return;
      try {
        document.documentElement.dataset.skin = e.newValue;
      } catch {
        return;
      }
      notify();
    });
    storageHooked = true;
  } catch {
    // No window (server render, tests): subscriptions stay in-process.
  }
}

// Reads the live data-skin on documentElement (DEFAULT_SKIN on the server or
// when invalid). Client-safe: never throws.
export function getSkin(): SkinId {
  try {
    if (typeof document === "undefined") return DEFAULT_SKIN;
    const v: unknown = document.documentElement?.dataset?.skin;
    return isSkinId(v) ? v : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

// Sets data-skin, persists to SKIN_KEY (try/catch), notifies subscribers.
export function setSkin(s: SkinId): void {
  try {
    document.documentElement.dataset.skin = s;
  } catch {
    // No DOM (server render, tests): still persist and notify below.
  }
  try {
    localStorage.setItem(SKIN_KEY, s);
  } catch {
    // Private mode / denied storage: the live value still applies.
  }
  notify();
}

export function subscribe(cb: SkinListener): () => void {
  listeners.add(cb);
  hookStorage();
  return () => {
    listeners.delete(cb);
  };
}

// Next skin in SKINS order, applied. For the home cycling button.
export function cycleSkin(): SkinId {
  const next = SKINS[(SKINS.indexOf(getSkin()) + 1) % SKINS.length]!;
  setSkin(next);
  return next;
}
