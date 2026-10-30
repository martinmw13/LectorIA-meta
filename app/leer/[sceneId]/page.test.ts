import { describe, expect, it } from "vitest";
import LeerSceneRoute from "./page";

describe("/leer/[sceneId]", () => {
  it("redirects old Oz addresses to the generic reader", async () => {
    const err = await LeerSceneRoute({ params: Promise.resolve({ sceneId: "c3s2" }) }).catch((e) => e);
    const digest = String((err as { digest?: unknown }).digest ?? err);
    expect(digest).toContain("/read/oz/c3s2");
  });
});
