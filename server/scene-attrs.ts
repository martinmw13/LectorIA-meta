import "server-only";
import { sceneAttributes } from "@/core/bookmap";
import { loadBookmap } from "@/server/bookmap";
import { isReadyBookId, loadBookData } from "@/server/books";

// Scene ids look like c1s1 or c1s1b: chapter, scene, optional split suffix.
const SCENE_ID_RE = /^c\d+s\d+[a-z]?$/;

function notFound(): Response {
  return Response.json({ error: "not found" }, { status: 404 });
}

// One scene's Developer View slice: setting, cast names, key objects.
// The page never ships it; the panel fetches it while open. Static per
// deploy, so the response caches publicly. No Redis, no Meta, no secrets.
export async function handleSceneAttrsGet(req: Request): Promise<Response> {
  try {
    const params = new URL(req.url).searchParams;
    const bookId = params.get("bookId") ?? "";
    const sceneId = params.get("sceneId") ?? "";
    if (!isReadyBookId(bookId) || !SCENE_ID_RE.test(sceneId)) return notFound();
    const { book, scenes } = await loadBookData(bookId);
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return notFound();
    const attr = sceneAttributes(loadBookmap(book.id, book.textVersion), [
      { id: sceneId, ch: scene.ch },
    ])[sceneId];
    if (!attr) return notFound();
    return Response.json(attr, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    console.error("scene-attrs failed");
    return Response.json({ error: "unavailable" }, { status: 500 });
  }
}
