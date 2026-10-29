import "server-only";
import { createHmac } from "node:crypto";

// Per-person quota: 5 new images per day, counted by hashed IP and by
// anonymous cookie, whichever runs out first. Day keys are UTC dates.
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

// Quota input for the IP-side key: a real IP is shared across cookies,
// while "unknown" falls back to per-cookie separation so one client
// cannot exhaust the bucket for all the others.
export function ipBucket(ip: string, anonId: string): string {
  return ip === "unknown" ? `unknown:${anonId}` : ip;
}

// First live platform header wins: the Vercel forwarding header, then
// the single-IP real-ip header, then the first x-forwarded-for entry.
// Each candidate is trimmed and loosely validated (no spaces or commas,
// at most 64 chars); anything else falls through to "unknown".
export function clientIp(headers: Headers): string {
  const single = (name: string): string | null => clean(headers.get(name));
  return (
    single("x-vercel-forwarded-for") ??
    single("x-real-ip") ??
    clean(headers.get("x-forwarded-for")?.split(",")[0]) ??
    "unknown"
  );
}

function clean(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const ip = raw.trim();
  if (ip === "" || ip.length > 64 || /[\s,]/.test(ip)) return null;
  return ip;
}
