import "server-only";

// Short, secret-free reason for logs; raw messages may carry URLs/tokens.
export function errorTag(e: unknown): string {
  if (!(e instanceof Error)) return "unknown";
  if (/^(kv|meta) (status \d{3}|error|empty image)$/.test(e.message)) return e.message;
  const code = (e as { cause?: { code?: unknown } }).cause?.code;
  const suffix = typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? `:${code}` : "";
  return `${e.name}${suffix}`;
}
