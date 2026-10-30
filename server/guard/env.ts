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
