// One source for the picture icon and the strings shared by the image
// pane and the inline figures. Copy stays byte-identical in both.
"use client";

import { Icon } from "../icons";

export const PICTURE_COPY = {
  retry: "Try again",
  remove: "Remove picture",
  // Shown when another picture is still on its way.
  oneAtATime: "One picture at a time",
} as const;

export function PictureIcon({ size = 13 }: { size?: number }) {
  return <Icon name="picture" size={size} />;
}
