// `vercel env pull` writes Sensitive vars as "[SENSITIVE]".
export function usable(raw: string | undefined): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (/^\[[A-Z_]+\]$/.test(raw.trim())) return undefined;
  return raw;
}
