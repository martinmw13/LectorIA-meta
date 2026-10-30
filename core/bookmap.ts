// BookMap types plus the hand-written validator. Pure: no env reads, no
// network, no server-only. Every LLM string is clamped and stripped of
// control characters and angle brackets; unknown fields and ids are
// dropped, never trusted.
export const BOOKMAP_LIMITS = {
  characters: 120,
  name: 120,
  aliases: 12,
  alias: 60,
  physicalDescription: 400,
  timePeriod: 80,
  world: 120,
  settingDescription: 600,
  summary: 500,
  cover: 500,
  location: 80,
  timeOfDay: 40,
  weather: 80,
  keyObjects: 10,
  keyObject: 60,
  present: 20,
} as const;

export interface BookmapSetting {
  time_period: string;
  world: string;
  description: string;
}

export interface BookmapCharacter {
  id: string;
  name: string;
  aliases: string[];
  physical_description: string;
  first_ch: number | null;
}

export interface BookmapChapter {
  ch: number;
  title: string;
  summary: string;
  cover_description: string;
}

export interface BookmapSceneSetting {
  location: string;
  time_of_day: string;
  weather: string;
}

export interface BookmapScene {
  setting: BookmapSceneSetting;
  characters_present: string[];
  key_objects: string[];
}

export interface BookmapProvenance {
  date: string;
  model: string;
  input: string;
  requests: number;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  estimated_usd: number;
}

export interface BookMap {
  bookId: string;
  textVersion: string;
  setting: BookmapSetting;
  characters: BookmapCharacter[];
  chapters: BookmapChapter[];
  scenes: Record<string, BookmapScene>;
  provenance: BookmapProvenance;
}

// Non-LLM strings use this too, so ids and lookups stay consistent.
export function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x1f\x7f<>]/g, "")
    .trim()
    .slice(0, max);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}

export function normalizeName(text: string): string {
  return text.toLowerCase().trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export interface Stage1Result {
  setting: BookmapSetting;
  characters: Omit<BookmapCharacter, "first_ch">[];
}

// Total sanitizer: always returns a result for an object input, dropping
// what it cannot use. Null only when the input is not an object at all.
export function sanitizeStage1(data: unknown): Stage1Result | null {
  const obj = asRecord(data);
  if (!obj) return null;
  const rawSetting = asRecord(obj.setting) ?? {};
  const setting: BookmapSetting = {
    time_period: cleanString(rawSetting.time_period, BOOKMAP_LIMITS.timePeriod),
    world: cleanString(rawSetting.world, BOOKMAP_LIMITS.world),
    description: cleanString(rawSetting.description, BOOKMAP_LIMITS.settingDescription),
  };
  const rawChars = Array.isArray(obj.characters) ? obj.characters.slice(0, BOOKMAP_LIMITS.characters) : [];
  const seen = new Set<string>();
  const characters: Stage1Result["characters"] = [];
  for (const raw of rawChars) {
    const char = asRecord(raw);
    if (!char) continue;
    const name = cleanString(char.name, BOOKMAP_LIMITS.name);
    if (!name) continue;
    let id = slugify(typeof char.id === "string" && char.id ? char.id : name);
    if (!id) continue;
    if (seen.has(id)) {
      let k = 2;
      while (seen.has(`${id}-${k}`)) k += 1;
      id = `${id}-${k}`;
    }
    seen.add(id);
    const aliases: string[] = [];
    if (Array.isArray(char.aliases)) {
      for (const rawAlias of char.aliases.slice(0, BOOKMAP_LIMITS.aliases)) {
        const alias = cleanString(rawAlias, BOOKMAP_LIMITS.alias);
        const key = normalizeName(alias);
        if (alias && key !== normalizeName(name) && !aliases.some((a) => normalizeName(a) === key)) {
          aliases.push(alias);
        }
      }
    }
    characters.push({
      id,
      name,
      aliases,
      physical_description: cleanString(char.physical_description, BOOKMAP_LIMITS.physicalDescription),
    });
  }
  return { setting, characters };
}

export interface ChapterResult {
  summary: string;
  cover_description: string;
  scenes: Record<string, BookmapScene>;
  discovered: { id: string; name: string }[];
  problems: string[];
}

// Sanitizes one chapter answer. Scene entries keyed by an unknown id are
// dropped; ids missing from the answer become problems for the retry.
export function sanitizeChapter(
  data: unknown,
  sceneIds: string[],
  lookup: Map<string, string>,
): ChapterResult {
  const empty: ChapterResult = { summary: "", cover_description: "", scenes: {}, discovered: [], problems: ["answer is not an object"] };
  const obj = asRecord(data);
  if (!obj) return empty;
  const wanted = new Set(sceneIds);
  const scenes: Record<string, BookmapScene> = {};
  const discovered: { id: string; name: string }[] = [];
  const seenDiscovered = new Set<string>();
  const rawScenes = Array.isArray(obj.scenes) ? obj.scenes : [];
  for (const raw of rawScenes) {
    const entry = asRecord(raw);
    if (!entry || typeof entry.id !== "string" || !wanted.has(entry.id)) continue;
    const rawSetting = asRecord(entry.setting) ?? {};
    const present: string[] = [];
    if (Array.isArray(entry.characters_present)) {
      for (const rawName of entry.characters_present.slice(0, BOOKMAP_LIMITS.present)) {
        if (typeof rawName !== "string") continue;
        const known = lookup.get(normalizeName(rawName));
        if (known && !present.includes(known)) {
          present.push(known);
          continue;
        }
        if (known) continue;
        const id = slugify(rawName);
        if (!id || present.includes(id)) continue;
        present.push(id);
        if (!seenDiscovered.has(id)) {
          seenDiscovered.add(id);
          discovered.push({ id, name: cleanString(rawName, BOOKMAP_LIMITS.name) });
        }
      }
    }
    const objects: string[] = [];
    if (Array.isArray(entry.key_objects)) {
      for (const rawObject of entry.key_objects.slice(0, BOOKMAP_LIMITS.keyObjects)) {
        const object = cleanString(rawObject, BOOKMAP_LIMITS.keyObject);
        if (object && !objects.includes(object)) objects.push(object);
      }
    }
    scenes[entry.id] = {
      setting: {
        location: cleanString(rawSetting.location, BOOKMAP_LIMITS.location),
        time_of_day: cleanString(rawSetting.time_of_day, BOOKMAP_LIMITS.timeOfDay),
        weather: cleanString(rawSetting.weather, BOOKMAP_LIMITS.weather),
      },
      characters_present: present,
      key_objects: objects,
    };
  }
  const problems: string[] = [];
  const summary = cleanString(obj.summary, BOOKMAP_LIMITS.summary);
  if (!summary) problems.push("missing chapter summary");
  for (const id of sceneIds) {
    if (!scenes[id]) problems.push(`missing scene ${id}`);
  }
  return {
    summary,
    cover_description: cleanString(obj.cover_description, BOOKMAP_LIMITS.cover),
    scenes,
    discovered,
    problems,
  };
}

// Lookup from every known spelling (id, name, alias) to the character id.
export function buildLookup(characters: { id: string; name: string; aliases: string[] }[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const char of characters) {
    for (const spelling of [char.id, char.name, ...char.aliases]) {
      const key = normalizeName(spelling);
      if (key && !lookup.has(key)) lookup.set(key, char.id);
    }
  }
  return lookup;
}

// Merges stage 1 characters with ids discovered per scene. first_ch comes
// from scene data only: scenes.json name lists plus validated
// characters_present, never from the LLM.
export function buildCharacters(
  stage1: Stage1Result["characters"],
  discovered: { id: string; name: string }[],
  scenes: { id: string; ch: number; characters: string[] }[],
  presentByScene: Record<string, string[]>,
): BookmapCharacter[] {
  const merged = stage1.map((c) => ({ ...c }));
  const ids = new Set(merged.map((c) => c.id));
  for (const item of discovered) {
    if (!item.id || ids.has(item.id)) continue;
    ids.add(item.id);
    merged.push({ id: item.id, name: item.name || item.id, aliases: [], physical_description: "" });
  }
  const lookup = buildLookup(merged);
  const first = new Map<string, number>();
  const note = (id: string, ch: number): void => {
    if (!ids.has(id)) return;
    const prev = first.get(id);
    if (prev === undefined || ch < prev) first.set(id, ch);
  };
  for (const scene of scenes) {
    for (const name of scene.characters) {
      const id = lookup.get(normalizeName(name));
      if (id) note(id, scene.ch);
    }
    for (const id of presentByScene[scene.id] ?? []) note(id, scene.ch);
  }
  return merged.map((c) => ({ ...c, first_ch: first.get(c.id) ?? null }));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

// Client-safe per-scene slice for the Developer View: setting, cast
// display names, and key objects only. No physical descriptions, no
// chapter summaries, no provenance ever leave the server.
export interface SceneAttr {
  location: string;
  timeOfDay: string;
  weather: string;
  cast: string[];
  keyObjects: string[];
}

// Shape check for the scene-attrs response: a bad payload hides the
// Developer View section instead of crashing it.
export function isSceneAttr(value: unknown): value is SceneAttr {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.location === "string" &&
    typeof v.timeOfDay === "string" &&
    typeof v.weather === "string" &&
    Array.isArray(v.cast) &&
    v.cast.every((c) => typeof c === "string") &&
    Array.isArray(v.keyObjects) &&
    v.keyObjects.every((o) => typeof o === "string")
  );
}

// Builds attrs for exactly the scenes asked for (the page already being
// rendered). Null bookmap yields nothing; scenes without an entry are
// skipped so the panel hides the section. Cast keeps only characters
// introduced at or before the scene's chapter, by display name.
export function sceneAttributes(bookmap: BookMap | null, scenes: { id: string; ch: number }[]): Record<string, SceneAttr> {
  const out: Record<string, SceneAttr> = {};
  if (!bookmap) return out;
  const byId = new Map(bookmap.characters.map((c) => [c.id, c]));
  for (const scene of scenes) {
    const entry = bookmap.scenes[scene.id];
    if (!entry) continue;
    const cast: string[] = [];
    for (const id of entry.characters_present) {
      const char = byId.get(id);
      if (!char || char.first_ch === null || char.first_ch > scene.ch) continue;
      if (!cast.includes(char.name)) cast.push(char.name);
    }
    out[scene.id] = {
      location: entry.setting.location,
      timeOfDay: entry.setting.time_of_day,
      weather: entry.setting.weather,
      cast,
      keyObjects: [...entry.key_objects],
    };
  }
  return out;
}

// Strict shape check for bookmap.json on load. Anything off returns null;
// the caller treats the book as not enriched.
export function validateBookmap(data: unknown): BookMap | null {
  const obj = asRecord(data);
  if (!obj || typeof obj.bookId !== "string" || !obj.bookId || typeof obj.textVersion !== "string") return null;
  const setting = asRecord(obj.setting);
  if (!setting || typeof setting.time_period !== "string" || typeof setting.world !== "string" || typeof setting.description !== "string") {
    return null;
  }
  if (!Array.isArray(obj.characters) || !Array.isArray(obj.chapters)) return null;
  const characters: BookmapCharacter[] = [];
  const ids = new Set<string>();
  for (const raw of obj.characters) {
    const char = asRecord(raw);
    if (
      !char ||
      typeof char.id !== "string" ||
      !char.id ||
      typeof char.name !== "string" ||
      !char.name ||
      !isStringArray(char.aliases) ||
      typeof char.physical_description !== "string" ||
      !(typeof char.first_ch === "number" || char.first_ch === null)
    ) {
      return null;
    }
    if (ids.has(char.id)) return null;
    ids.add(char.id);
    characters.push(char as unknown as BookmapCharacter);
  }
  const chapters: BookmapChapter[] = [];
  for (const raw of obj.chapters) {
    const chapter = asRecord(raw);
    if (
      !chapter ||
      typeof chapter.ch !== "number" ||
      typeof chapter.title !== "string" ||
      typeof chapter.summary !== "string" ||
      typeof chapter.cover_description !== "string"
    ) {
      return null;
    }
    chapters.push(chapter as unknown as BookmapChapter);
  }
  const rawScenes = asRecord(obj.scenes);
  if (!rawScenes) return null;
  const scenes: Record<string, BookmapScene> = {};
  for (const [id, raw] of Object.entries(rawScenes)) {
    const entry = asRecord(raw);
    const entrySetting = entry ? asRecord(entry.setting) : null;
    if (
      !entry ||
      !entrySetting ||
      typeof entrySetting.location !== "string" ||
      typeof entrySetting.time_of_day !== "string" ||
      typeof entrySetting.weather !== "string" ||
      !isStringArray(entry.characters_present) ||
      !isStringArray(entry.key_objects) ||
      !(entry.characters_present as string[]).every((charId) => ids.has(charId))
    ) {
      return null;
    }
    scenes[id] = entry as unknown as BookmapScene;
  }
  const provenance = asRecord(obj.provenance);
  if (!provenance || typeof provenance.model !== "string" || typeof provenance.input !== "string") return null;
  return obj as unknown as BookMap;
}
