import "server-only";
import { loadOzBook } from "@/server/books";
import { MSG_BAD_REQUEST, MSG_UNAVAILABLE, parseImageRequest, validateAgainstBook } from "@/core/images";
import type { ImageRequest, ImageResponse } from "@/core/images";
import { readImageEnv } from "./env";
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
  let parsed: ImageRequest;
  try {
    parsed = parseImageRequest(await req.json());
  } catch {
    return Response.json(
      { status: "error", code: "bad_request", message: MSG_BAD_REQUEST } satisfies ImageResponse,
      { status: 400 },
    );
  }

  let env;
  try {
    env = readImageEnv();
  } catch {
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
    const sceneParas = sceneOf
      ? book.paragraphs.filter((p) => p.n >= sceneOf.start_n && p.n <= sceneOf.end_n)
      : [];
    const content: ImageContent = {
      passageText: parsed.kind === "passage" ? (byN.get(parsed.n) ?? "") : "",
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
    });

    const { json, status } = toResponse(res);
    const headers = setCookie ? { "Set-Cookie": setCookie } : undefined;
    return Response.json(json, { status, headers });
  } catch {
    console.error("image request failed");
    return Response.json(
      { status: "error", code: "unavailable", message: MSG_UNAVAILABLE } satisfies ImageResponse,
      { status: 503 },
    );
  }
}
