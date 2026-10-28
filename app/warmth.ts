// Page warmth: a continuous 0..1 value, neutral by default. CSS receives
// the eased value as --warmth, so the low end stays subtle and the top
// end gets deep amber. The inline script in layout.tsx repeats parsing
// and easing (it cannot import); keep them in sync.
export const WARMTH_KEY = "lectoria.warmth.v2";
// Old four-step index (0..3) from the first warmth control.
export const LEGACY_WARMTH_KEY = "lectoria.warmth";
const LEGACY_MAX = 3;
const CURVE = 1.7;

export function parseWarmth(stored: unknown): number {
  if (stored === null || stored === undefined || stored === "") return 0;
  const n = Number(stored);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export function easeWarmth(value: number): number {
  return value ** CURVE;
}

export function warmthBand(value: number): string {
  if (value < 0.15) return "Neutral";
  if (value < 0.45) return "Warm";
  if (value < 0.8) return "Very warm";
  return "Candlelight";
}

// Reads the stored value, migrating a legacy step index once.
export function loadWarmth(storage: Storage): number {
  const current = storage.getItem(WARMTH_KEY);
  if (current !== null) return parseWarmth(current);
  const legacy = Number(storage.getItem(LEGACY_WARMTH_KEY));
  storage.removeItem(LEGACY_WARMTH_KEY);
  if (!Number.isInteger(legacy) || legacy <= 0 || legacy > LEGACY_MAX) return 0;
  const migrated = legacy / LEGACY_MAX;
  storage.setItem(WARMTH_KEY, String(migrated));
  return migrated;
}

export function applyWarmth(value: number): void {
  document.documentElement.style.setProperty("--warmth", String(easeWarmth(value)));
}

export const WARMTH_SCRIPT = `(function(){try{var s=localStorage,v=s.getItem(${JSON.stringify(WARMTH_KEY)}),n;if(v===null){var o=Number(s.getItem(${JSON.stringify(LEGACY_WARMTH_KEY)}));n=o%1===0&&o>0&&o<=${LEGACY_MAX}?o/${LEGACY_MAX}:0;}else{n=Math.min(1,Math.max(0,Number(v)||0));}if(n>0){document.documentElement.style.setProperty("--warmth",String(Math.pow(n,${CURVE})));}}catch(e){}})();`;
