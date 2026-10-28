// Page warmth: four steps, neutral by default, stored as the step index.
// The inline script in layout.tsx sets --warmth before first paint; keep
// its parsing in sync with warmthStep.
export const WARMTH_KEY = "lectoria.warmth";
export const WARMTH_STEPS = ["Neutral", "Warm", "Warmer", "Warmest"] as const;
export const WARMTH_MAX = WARMTH_STEPS.length - 1;

export function warmthStep(stored: unknown): number {
  const n = Number(stored);
  return Number.isInteger(n) && n >= 0 && n <= WARMTH_MAX ? n : 0;
}

export function applyWarmth(step: number): void {
  document.documentElement.style.setProperty("--warmth", String(step / WARMTH_MAX));
}

export const WARMTH_SCRIPT = `(function(){try{var n=Number(localStorage.getItem(${JSON.stringify(WARMTH_KEY)}));if(n>=1&&n<=${WARMTH_MAX}&&n%1===0){document.documentElement.style.setProperty("--warmth",String(n/${WARMTH_MAX}));}}catch(e){}})();`;
