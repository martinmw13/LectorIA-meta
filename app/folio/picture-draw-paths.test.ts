// Every skin draws its own Picture this sketch: strokes in each pass,
// a still for reduced motion, and warm status copy.
import { expect, test } from "vitest";
import { SKINS } from "../skin";
import { DRAW_STATUS, stillStrokes, strokesForSkin } from "./picture-draw-paths";

test("every skin has strokes, a still and its own status line", () => {
  const statuses = new Set<string>();
  for (const skin of SKINS) {
    for (let layer = 0; layer < 4; layer++) {
      expect(strokesForSkin(skin, layer).length, `${skin} layer ${layer}`).toBeGreaterThan(0);
    }
    const still = stillStrokes(skin);
    expect(still.length).toBeGreaterThan(0);
    for (const s of still) expect(s.d).toMatch(/^M/);
    expect(DRAW_STATUS[skin]).toMatch(/…$/);
    expect(DRAW_STATUS[skin]).not.toMatch(/generat/i);
    statuses.add(DRAW_STATUS[skin]);
  }
  expect(statuses.size).toBeGreaterThanOrEqual(4);
});

test("the three new skins draw differently from the art they used to borrow", () => {
  const first = (skin: (typeof SKINS)[number]) => JSON.stringify(strokesForSkin(skin, 0));
  expect(first("pencil")).not.toBe(first("engraving"));
  expect(first("comic")).not.toBe(first("ink"));
  expect(first("chihiro")).not.toBe(first("watercolor"));
});
