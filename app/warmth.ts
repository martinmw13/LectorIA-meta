// Page warmth: a continuous 0..1 value, neutral by default. CSS receives
// the eased value as --warmth, so the low end stays subtle and the top
// end gets deep amber.
export const WARMTH_KEY = "lectoria.warmth.v2";
// Old four-step index (0..3) from the first warmth control.
export const LEGACY_WARMTH_KEY = "lectoria.warmth";
const LEGACY_MAX = 3;
const CURVE = 1.7;

// The one parser. It is also stringified into the pre-paint script, so it
// must stay self-contained: arguments, Number and Math only.
function readStoredWarmth(current: string | null, legacy: string | null, legacyMax: number): number {
  if (current !== null && current !== "") {
    const n = Number(current);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
  const step = Number(legacy);
  return Number.isInteger(step) && step > 0 && step <= legacyMax ? step / legacyMax : 0;
}

function easeStoredWarmth(value: number, curve: number): number {
  return Math.pow(value, curve);
}

export function parseWarmth(stored: unknown): number {
  return readStoredWarmth(stored === null || stored === undefined ? null : String(stored), null, LEGACY_MAX);
}

export function easeWarmth(value: number): number {
  return easeStoredWarmth(value, CURVE);
}

export function warmthBand(value: number): string {
  if (value < 0.15) return "Neutral";
  if (value < 0.45) return "Warm";
  if (value < 0.8) return "Very warm";
  return "Candlelight";
}

// Reads the stored value; a legacy step index migrates once to the new key.
export function loadWarmth(storage: Storage): number {
  const current = storage.getItem(WARMTH_KEY);
  const value = readStoredWarmth(current, storage.getItem(LEGACY_WARMTH_KEY), LEGACY_MAX);
  if (current === null) {
    storage.removeItem(LEGACY_WARMTH_KEY);
    if (value > 0) storage.setItem(WARMTH_KEY, String(value));
  }
  return value;
}

export function applyWarmth(value: number): void {
  document.documentElement.style.setProperty("--warmth", String(easeWarmth(value)));
}

// Pre-paint: same parser and curve as loadWarmth, so hydration never jumps.
// It only reads; the control performs the migration write on mount.
export const WARMTH_SCRIPT = `(function(){try{var s=localStorage;var n=(${readStoredWarmth.toString()})(s.getItem(${JSON.stringify(WARMTH_KEY)}),s.getItem(${JSON.stringify(LEGACY_WARMTH_KEY)}),${LEGACY_MAX});if(n>0){document.documentElement.style.setProperty("--warmth",String((${easeStoredWarmth.toString()})(n,${CURVE})));}}catch(e){}})();`;
