export const SKINS = ["engraving", "watercolor", "ink"] as const;
export type SkinId = (typeof SKINS)[number];
// Denslow fits Oz; the default until a skin switcher exists.
export const DEFAULT_SKIN: SkinId = "engraving";

export function isSkinId(v: unknown): v is SkinId {
  return (SKINS as readonly unknown[]).includes(v);
}

// Temporary until the skin switcher exists: `?skin=` previews one skin by
// setting data-skin before paint. Anything else is ignored (the server
// default stays). Not persisted.
export const SKIN_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("skin");if(${JSON.stringify(SKINS)}.indexOf(q)>=0){document.documentElement.dataset.skin=q;}}catch(e){}})();`;
