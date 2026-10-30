// `vercel env pull` writes Sensitive vars as "[SENSITIVE]".
export function usable(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (/^\[[A-Z_]+\]$/.test(raw.trim())) return undefined;
  return raw;
}

export interface TurnstilePair {
  turnstileSecret?: string;
  turnstileSiteKey?: string;
}

// Placeholders filtered so a pulled "[SENSITIVE]" secret never turns the check on.
export function turnstilePair(from: NodeJS.ProcessEnv): TurnstilePair {
  const secret = usable(from.TURNSTILE_SECRET_KEY);
  const siteKey = usable(from.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  return {
    ...(secret ? { turnstileSecret: secret } : {}),
    ...(siteKey ? { turnstileSiteKey: siteKey } : {}),
  };
}

// One rule for both spend caps: a finite, non-negative USD value wins,
// anything else (missing, blank, non-numeric, negative, Infinity) falls back.
// Zero stays valid so a zero cap can intentionally block spend.
export function parseCapUsd(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
