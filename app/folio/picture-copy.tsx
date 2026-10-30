// One source for the picture icon and the strings shared by the image
// pane and the inline figures. Copy stays byte-identical in both.
"use client";

import { MSG_HUMAN } from "@/core/images";
import { Icon } from "../icons";

export const PICTURE_COPY = {
  retry: "Try again",
  remove: "Remove picture",
  // Shown when another picture is still on its way.
  oneAtATime: "One picture at a time",
  // Shown with the person-check before retrying the failed picture.
  human: MSG_HUMAN,
  // Shown instead of retry on daily and budget limits: pictures rest,
  // while chat keeps its own key option open.
  quotaByok: "You can keep asking questions meanwhile \u2014 chat has a Bring your own key! option.",
} as const;

export function PictureIcon({ size = 13 }: { size?: number }) {
  return <Icon name="picture" size={size} />;
}
