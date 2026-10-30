import "server-only";
import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

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
// Bucket IPv6 by /64 prefix so one client rotating interface IDs shares one quota bucket.
export function ipBucket(ip: string, anonId: string): string {
  if (ip === "unknown") return `unknown:${anonId}`;
  return canonicalIpBucket(ip);
}

// Canonical bucket form for IPv6 is zero-padded lowercase "xxxx:xxxx:xxxx:xxxx::/64" (first 4 hextets).
function canonicalIpBucket(ip: string): string {
  let v = ip;
  if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
  const pct = v.indexOf("%");
  if (pct !== -1) v = v.slice(0, pct);
  if (isIPv4(v)) return v;
  if (!isIPv6(v)) return ip;
  if (v.includes(".")) {
    const i = v.lastIndexOf(":");
    const o = v.slice(i + 1).split(".").map(Number);
    v = `${v.slice(0, i + 1)}${((o[0] ?? 0) * 256 + (o[1] ?? 0)).toString(16)}:${((o[2] ?? 0) * 256 + (o[3] ?? 0)).toString(16)}`;
  }
  const [l = "", r] = v.split("::");
  const a = l ? l.split(":") : [];
  const b = r === undefined ? [] : r ? r.split(":") : [];
  const full =
    r === undefined ? v.split(":") : [...a, ...Array<string>(8 - a.length - b.length).fill("0"), ...b];
  const g = full.map((p) => parseInt(p, 16));
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff)
    return `${(g[6] ?? 0) >> 8}.${(g[6] ?? 0) & 255}.${(g[7] ?? 0) >> 8}.${(g[7] ?? 0) & 255}`;
  const h = (n: number | undefined) => (n ?? 0).toString(16).padStart(4, "0");
  return `${h(g[0])}:${h(g[1])}:${h(g[2])}:${h(g[3])}::/64`;
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

// Reject cross-site simple-request CSRF: a third-party page can make a
// visitor's browser send a `mode:"no-cors"` `text/plain` POST (a CORS
// simple request, no preflight), spending owner budget and draining the
// shared daily spend cap from many IPs. Our own clients always send
// `Content-Type: application/json` from the same origin, so anything
// else is not ours. Pure: reads headers and the request URL only, and
// never logs header values.
export function rejectsCrossSite(headers: Headers, requestUrl: string): boolean {
  const mediaType = headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") return true;

  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite !== null && fetchSite !== undefined && fetchSite !== "") {
    if (fetchSite !== "same-origin" && fetchSite !== "none") return true;
  }

  const origin = headers.get("origin")?.trim();
  if (origin !== null && origin !== undefined && origin !== "") {
    if (origin === "null") return true;
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return true;
    }
    const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const hostHeader = headers.get("host")?.trim();
    let requestHost = (forwarded || hostHeader || "").toLowerCase();
    if (!requestHost) {
      try {
        requestHost = new URL(requestUrl).host.toLowerCase();
      } catch {
        return true;
      }
    }
    if (originHost !== requestHost) return true;
  }

  return false;
}
