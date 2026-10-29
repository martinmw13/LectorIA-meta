import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  HUMAN_COOKIE,
  LEGACY_HUMAN_COOKIE,
  checkHuman,
  issueHumanCookie,
  parseHumanCookie,
  resetTurnstileWarnForTests,
  verifyHumanCookie,
  verifyTurnstile,
  warnTurnstileSkippedOnce,
} from "./human";

const SECRET = "test-session-secret-for-human";
const NOW = 1_700_000_000;

function legacyCookie(secret: string, nowSec = NOW): string {
  const expiry = nowSec + 2 * 3600;
  const sig = createHmac("sha256", secret).update(`${LEGACY_HUMAN_COOKIE}:${expiry}`).digest("hex");
  return `${LEGACY_HUMAN_COOKIE}=${expiry}.${sig}; Path=/api/chat; HttpOnly; Secure; SameSite=Lax; Max-Age=7200`;
}

afterEach(() => {
  vi.restoreAllMocks();
  resetTurnstileWarnForTests();
});

describe("human cookie", () => {
  it("issues the neutral cookie on Path=/api", () => {
    const out = issueHumanCookie(SECRET, NOW);
    expect(out.startsWith(`${HUMAN_COOKIE}=`)).toBe(true);
    expect(out).toContain("Path=/api");
    expect(out).not.toContain("Path=/api/chat");
    expect(out).toContain("HttpOnly");
    expect(out).toContain("Secure");
    expect(out).toContain("SameSite=Lax");
  });

  it("accepts a valid signature", () => {
    const value = issueHumanCookie(SECRET, NOW).split(";")[0]!.split("=")[1]!;
    expect(verifyHumanCookie(value, SECRET, NOW)).toBe(true);
  });

  it("rejects a tampered value, a wrong secret, and an expired cookie", () => {
    const value = issueHumanCookie(SECRET, NOW).split(";")[0]!.split("=")[1]!;
    expect(verifyHumanCookie(`${value}x`, SECRET, NOW)).toBe(false);
    expect(verifyHumanCookie(value, "wrong-secret", NOW)).toBe(false);
    expect(verifyHumanCookie(value, SECRET, NOW + 3 * 3600)).toBe(false);
    expect(verifyHumanCookie(null, SECRET, NOW)).toBe(false);
    expect(verifyHumanCookie("no-dot-here", SECRET, NOW)).toBe(false);
  });

  it("prefers the neutral cookie but accepts the legacy one", () => {
    const fresh = issueHumanCookie(SECRET, NOW).split(";")[0]!;
    const legacy = legacyCookie(SECRET, NOW).split(";")[0]!;
    expect(parseHumanCookie(`other=1; ${legacy}; ${fresh}`)).toBe(fresh.split("=")[1]);
    expect(parseHumanCookie(`other=1; ${legacy}`)).toBe(legacy.split("=")[1]);
    expect(parseHumanCookie(null)).toBeNull();
  });

  it("verifies the legacy cookie with the legacy name in the signature", () => {
    const legacy = legacyCookie(SECRET, NOW).split("=")[1]!.split(";")[0]!;
    expect(verifyHumanCookie(legacy, SECRET, NOW)).toBe(true);
  });
});

describe("verifyTurnstile", () => {
  it("passes on success:true and fails on success:false", async () => {
    const ok = vi.fn(async () => Response.json({ success: true }));
    await expect(verifyTurnstile("tok", "1.2.3.4", "secret", ok as unknown as typeof fetch)).resolves.toBe(
      true,
    );
    const no = vi.fn(async () => Response.json({ success: false }));
    await expect(verifyTurnstile("tok", "1.2.3.4", "secret", no as unknown as typeof fetch)).resolves.toBe(
      false,
    );
  });

  it("omits remoteip when the IP is unknown", async () => {
    let body = "";
    const probe = vi.fn(async (_url: unknown, init: { body: string }) => {
      body = init.body;
      return Response.json({ success: true });
    });
    await expect(
      verifyTurnstile("tok", "unknown", "secret", probe as unknown as typeof fetch),
    ).resolves.toBe(true);
    const params = new URLSearchParams(body);
    expect(params.get("response")).toBe("tok");
    expect(params.has("remoteip")).toBe(false);
  });

  it("sends remoteip for a known IP", async () => {
    let body = "";
    const probe = vi.fn(async (_url: unknown, init: { body: string }) => {
      body = init.body;
      return Response.json({ success: true });
    });
    await expect(
      verifyTurnstile("tok", "1.2.3.4", "secret", probe as unknown as typeof fetch),
    ).resolves.toBe(true);
    expect(new URLSearchParams(body).get("remoteip")).toBe("1.2.3.4");
  });

  it("fails on non-2xx, bad JSON, and network errors without throwing", async () => {
    const bad = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(verifyTurnstile("tok", "ip", "s", bad as unknown as typeof fetch)).resolves.toBe(false);
    const down = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(verifyTurnstile("tok", "ip", "s", down as unknown as typeof fetch)).resolves.toBe(
      false,
    );
  });
});

describe("checkHuman", () => {
  const base = { cookieHeader: null as string | null, ip: "1.2.3.4", sessionSecret: SECRET };

  it("skips with a one-time warning when no secret is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(checkHuman(base)).resolves.toEqual({ ok: true });
    await expect(checkHuman(base)).resolves.toEqual({ ok: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("turnstile");
  });

  it("honors the neutral cookie without calling siteverify", async () => {
    const fetchFn = vi.fn(async () => Response.json({ success: true }));
    const value = issueHumanCookie(SECRET).split(";")[0]!;
    const res = await checkHuman({
      ...base,
      cookieHeader: value,
      turnstileSecret: "ts-secret",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toEqual({ ok: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("honors the legacy cookie without calling siteverify", async () => {
    const fetchFn = vi.fn(async () => Response.json({ success: true }));
    const value = legacyCookie(SECRET, Math.floor(Date.now() / 1000)).split(";")[0]!;
    const res = await checkHuman({
      ...base,
      cookieHeader: value,
      turnstileSecret: "ts-secret",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(res).toEqual({ ok: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails closed with no cookie and no token", async () => {
    const fetchFn = vi.fn(async () => Response.json({ success: true }));
    await expect(
      checkHuman({ ...base, turnstileSecret: "ts-secret", fetchFn: fetchFn as unknown as typeof fetch }),
    ).resolves.toEqual({ ok: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("issues the neutral cookie on a valid token", async () => {
    const fetchFn = vi.fn(async () => Response.json({ success: true }));
    const res = await checkHuman({
      ...base,
      token: "tok",
      turnstileSecret: "ts-secret",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.setCookie).toMatch(new RegExp(`^${HUMAN_COOKIE}=`));
    expect(res.setCookie).toContain("Path=/api");
  });

  it("fails on a rejected token", async () => {
    const fetchFn = vi.fn(async () => Response.json({ success: false }));
    await expect(
      checkHuman({
        ...base,
        token: "tok",
        turnstileSecret: "ts-secret",
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: false });
  });
});
