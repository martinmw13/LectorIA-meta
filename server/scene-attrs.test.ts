import { describe, expect, it } from "vitest";
import { handleSceneAttrsGet } from "./scene-attrs";

function get(query: string): Promise<Response> {
  return handleSceneAttrsGet(new Request(`http://localhost/api/scene-attrs?${query}`));
}

describe("scene attrs", () => {
  it("returns just one scene's attrs for a known scene", async () => {
    const res = await get("bookId=oz&sceneId=c1s1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(["cast", "keyObjects", "location", "timeOfDay", "weather"]);
    expect(json.location).toBe("small one-room Kansas farmhouse interior");
    expect(json.timeOfDay).toBe("daytime");
    expect(json.cast).toEqual(["Dorothy", "Uncle Henry", "Aunt Em"]);
  });

  it("404s on unknown or invalid ids without echoing them", async () => {
    for (const query of [
      "bookId=nope&sceneId=c1s1",
      "bookId=oz&sceneId=c99s99",
      "bookId=oz&sceneId=../../etc",
      "bookId=oz&sceneId=c1s1<script>",
      "bookId=../oz&sceneId=c1s1",
      "bookId=oz",
      "sceneId=c1s1",
      "",
    ]) {
      const res = await get(query);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toBe('{"error":"not found"}');
    }
  });

  it("sends no descriptions, summaries, or provenance", async () => {
    const res = await get("bookId=oz&sceneId=c1s1");
    const text = await res.text();
    expect(text).not.toContain("physical_description");
    expect(text).not.toContain("summary");
    expect(text).not.toContain("provenance");
  });
});
