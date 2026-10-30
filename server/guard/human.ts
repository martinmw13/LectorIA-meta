import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { usable } from "./env";

// Neutral human cookie, readable on every /api route. The old chat-only
// name stays accepted during transition; only the new one is issued.
export const HUMAN_COOKIE = "human_ok";
export const LEGACY_HUMAN_COOKIE = "chat_human";
const HUMAN_TTL_SEC = 2 * 3600;

function sign(name: string, expiry: number, secret: string): string {
  return createHmac("sha256", secret).update(`${name}:${expiry}`).digest("hex");
}

export function issueHumanCookie(secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const expiry = nowSec + HUMAN_TTL_SEC;
  return `${HUMAN_COOKIE}=${expiry}.${sign(HUMAN_COOKIE, expiry, secret)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${HUMAN_TTL_SEC}`;
}

export function parseHumanCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  let legacy: string | null = null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === HUMAN_COOKIE) return part.slice(eq + 1).trim();
    if (name === LEGACY_HUMAN_COOKIE) legacy = part.slice(eq + 1).trim();
  }
  return legacy;
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
  // Outstanding cookies signed the legacy name, so try both.
  for (const name of [HUMAN_COOKIE, LEGACY_HUMAN_COOKIE]) {
    const expected = sign(name, expiry, secret);
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

let warnedOnce = false;

// Without both keys the check is skipped so dev works without keys.
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
  // "unknown" is our own placeholder, not a client address: omit it.
  const params = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") params.set("remoteip", ip);
  try {
    const res = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: unknown };
    return json !== null && typeof json === "object" && json.success === true;
  } catch {
    return false;
  }
}

export interface HumanCheckInput {
  cookieHeader: string | null | undefined;
  token?: string;
  ip: string;
  turnstileSecret?: string;
  turnstileSiteKey?: string;
  sessionSecret: string;
  fetchFn?: typeof fetch;
}

// Shared by chat and images: enforce only with both keys, since the widget
// renders nothing without the site key; otherwise skip so dev works.
export async function checkHuman(
  input: HumanCheckInput,
): Promise<{ ok: true; setCookie?: string } | { ok: false }> {
  const secret = usable(input.turnstileSecret);
  if (!secret || !usable(input.turnstileSiteKey)) {
    warnTurnstileSkippedOnce();
    return { ok: true };
  }
  if (verifyHumanCookie(parseHumanCookie(input.cookieHeader), input.sessionSecret)) {
    return { ok: true };
  }
  const ok = input.token ? await verifyTurnstile(input.token, input.ip, secret, input.fetchFn) : false;
  if (!ok) return { ok: false };
  return { ok: true, setCookie: issueHumanCookie(input.sessionSecret) };
}
