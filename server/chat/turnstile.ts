import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const HUMAN_COOKIE = "chat_human";
const HUMAN_TTL_SEC = 2 * 3600;

function sign(expiry: number, secret: string): string {
  return createHmac("sha256", secret).update(`${HUMAN_COOKIE}:${expiry}`).digest("hex");
}

export function issueHumanCookie(secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const expiry = nowSec + HUMAN_TTL_SEC;
  return `${HUMAN_COOKIE}=${expiry}.${sign(expiry, secret)}; Path=/api/chat; HttpOnly; Secure; SameSite=Lax; Max-Age=${HUMAN_TTL_SEC}`;
}

export function parseHumanCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === HUMAN_COOKIE) return part.slice(eq + 1).trim();
  }
  return null;
}

// True only with a valid signature and an unexpired timestamp. Comparison
// runs in constant time so a forged cookie reveals nothing about the secret.
export function verifyHumanCookie(
  value: string | null | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const expiry = Number(value.slice(0, dot));
  if (!Number.isSafeInteger(expiry) || expiry <= nowSec) return false;
  const sig = value.slice(dot + 1);
  const expected = sign(expiry, secret);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

let warnedOnce = false;

// Without a secret the check is skipped so dev works without keys.
export function warnTurnstileSkippedOnce(): void {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn("turnstile not configured, skipping");
}

export function resetTurnstileWarnForTests(): void {
  warnedOnce = false;
}

// False on any failure: network, non-2xx, bad JSON, or success: false.
// Never throws, and never includes the token or response text anywhere.
export async function verifyTurnstile(
  token: string,
  ip: string,
  secret: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchFn("https://challenges.cloudflare.com/turnstile/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: unknown };
    return json !== null && typeof json === "object" && json.success === true;
  } catch {
    return false;
  }
}
