import "server-only";
import { loadOzBook } from "@/server/books";
import {
  ImageStyleError,
  MSG_BAD_REQUEST,
  MSG_STYLE,
  MSG_UNAVAILABLE,
  parseImageRequest,
  validateAgainstBook,
} from "@/core/images";
import type { ImageRequest, ImageResponse } from "@/core/images";
import { MAX_IMAGE_BODY_BYTES, readBodyCapped } from "./body";
import { readImageEnv } from "./env";
import { errorTag } from "./errors";
import { createRestKV } from "./kv";
import { createBlobStore } from "./blob";
import { createMetaClient } from "./meta";
import { orchestrate } from "./orchestrate";
import type { ImageContent } from "./orchestrate";
import { issueAnonId, parseAnonCookie, serializeAnonCookie, verifyAnonCookie } from "./cookies";
import { clientIp, utcDay } from "./quota";

function toResponse(res: ImageResponse): { json: ImageResponse; status: number } {
  if (res.status === "ready" || res.status === "pending") return { json: res, status: 200 };
  const status = res.code === "bad_request" ? 400 : res.code === "quota" ? 429 : 503;
  return { json: res, status };
}

export async function handleImagesPost(req: Request): Promise<Response> {
  const capped = await readBodyCapped(req, MAX_IMAGE_BODY_BYTES);
  if (!capped.ok) {
    return Response.json(
      { status: "error", code: "bad_request", message: MSG_BAD_REQUEST } satisfies ImageResponse,
      { status: capped.reason === "too_large" ? 413 : 400 },
    );
  }

  let parsed: ImageRequest;
  try {
    parsed = parseImageRequest(JSON.parse(capped.text));
  } catch (e) {
    if (e instanceof ImageStyleError) {
      return Response.json(
        { status: "error", code: "bad_request", message: MSG_STYLE } satisfies ImageResponse,
        { status: 400 },
      );
    }
    return Response.json(
      { status: "error", code: "bad_request", message: MSG_BAD_REQUEST } satisfies ImageResponse,
      { status: 400 },
    );
  }

  let env;
  try {
    env = readImageEnv();
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const prefix = "missing image env:";
    const names = message.startsWith(prefix) ? message.slice(prefix.length).trim() : "";
    console.warn(`image env missing: ${names}`);
    return Response.json(
      { status: "error", code: "unavailable", message: MSG_UNAVAILABLE } satisfies ImageResponse,
      { status: 503 },
    );
  }

  try {
    const { book, scenes } = loadOzBook();
    try {
      validateAgainstBook(
        parsed,
        {
          id: book.id,
          textVersion: book.textVersion,
          paragraphNs: new Set(book.paragraphs.map((p) => p.n)),
          sceneIds: new Set(scenes.map((s) => s.id)),
        },
      );
    } catch {
      return Response.json(
        { status: "error", code: "bad_request", message: MSG_BAD_REQUEST } satisfies ImageResponse,
        { status: 400 },
      );
    }

    const byN = new Map(book.paragraphs.map((p) => [p.n, p.text]));
    const sceneOf = scenes.find((s) =>
      parsed.kind === "passage" ? parsed.n >= s.start_n && parsed.n <= s.end_n : s.id === parsed.sceneId,
    );
    // A selection never leaves its starting scene; a lone paragraph
    // keeps the bare pN key.
    if (parsed.kind === "passage" && parsed.endN !== undefined) {
      const end = Math.min(parsed.endN, sceneOf?.end_n ?? parsed.endN);
      const { endN: _dropped, ...single } = parsed;
      parsed = end <= parsed.n ? single : { ...parsed, endN: end };
    }
    const passageTexts: string[] = [];
    if (parsed.kind === "passage") {
      for (let n = parsed.n; n <= (parsed.endN ?? parsed.n); n++) passageTexts.push(byN.get(n) ?? "");
    }
    const sceneParas = sceneOf
      ? book.paragraphs.filter((p) => p.n >= sceneOf.start_n && p.n <= sceneOf.end_n)
      : [];
    const content: ImageContent = {
      passageText: parsed.kind === "passage" ? passageTexts.join(" ") : "",
      sceneTitle: sceneOf?.title ?? "",
      sceneClip: sceneParas.map((p) => p.text).join(" "),
    };

    const cookieValue = parseAnonCookie(req.headers.get("cookie"));
    let anonId = cookieValue ? verifyAnonCookie(cookieValue, env.sessionSecret) : null;
    let setCookie: string | null = null;
    if (!anonId) {
      const issued = issueAnonId(env.sessionSecret);
      anonId = issued.id;
      setCookie = serializeAnonCookie(issued.value);
    }

    const res = await orchestrate(parsed, {
      kv: createRestKV(env.upstashUrl, env.upstashToken),
      store: createBlobStore(),
      generate: createMetaClient(env.metaKey),
      env,
      content,
      ip: clientIp(req.headers.get("x-forwarded-for")),
      anonId,
      day: utcDay(),
      sceneId: sceneOf?.id ?? "",
    });

    const { json, status } = toResponse(res);
    const headers = setCookie ? { "Set-Cookie": setCookie } : undefined;
    return Response.json(json, { status, headers });
  } catch (e) {
    console.error(`image request failed: ${errorTag(e)}`);
    return Response.json(
      { status: "error", code: "unavailable", message: MSG_UNAVAILABLE } satisfies ImageResponse,
      { status: 503 },
    );
  }
}
