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

export function clientIp(forwardedFor: string | null | undefined): string {
  return (forwardedFor ?? "").split(",")[0]?.trim() || "unknown";
}
