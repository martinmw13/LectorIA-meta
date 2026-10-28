"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SKIN, getSkin, subscribe, type SkinId } from "./skin";

export function useSkin(): SkinId {
  return useSyncExternalStore(subscribe, getSkin, () => DEFAULT_SKIN);
}
