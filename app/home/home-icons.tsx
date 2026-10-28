import type { SVGProps } from "react";
import { Icon } from "../icons";

export type HomeIconName = "upload" | "key" | "external" | "heart" | "book" | "brush" | "check-box" | "eye" | "eye-off";

// Home icons from the shared registry, stroked in the skin's ink.
export function HomeIcon({ name, ...rest }: { name: HomeIconName } & SVGProps<SVGSVGElement>) {
  return (
    <Icon
      name={name}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    />
  );
}
