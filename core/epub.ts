// Client-safe EPUB parser: fflate plus the platform DOMParser, no node
// imports, so the home upload page can run it in the browser.
import { unzipSync } from "fflate";

export const MAX_EPUB_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_INFLATED_BYTES = 60 * 1024 * 1024;

export type EpubErrorCode = "not_epub" | "too_large" | "drm" | "unreadable";

export class EpubError extends Error {
  code: EpubErrorCode;
  constructor(code: EpubErrorCode) {
    super(code);
    this.name = "EpubError";
    this.code = code;
  }
}

export const EPUB_ERROR_MESSAGES: Record<EpubErrorCode, string> = {
  not_epub: "That doesn't look like an EPUB. Try a file that ends in .epub.",
  too_large: "That file is bigger than 20 MB. Most novels are far smaller, so try another edition.",
  drm: "This book is copy-protected, so we can't open it. Free classics from Project Gutenberg or Standard Ebooks work well.",
  unreadable: "We couldn't read this EPUB. It might be damaged. Try another copy.",
};

export interface EpubBook {
  title: string;
  author: string | null;
  chapters: string[];
  words: number;
  cover: { bytes: Uint8Array; mediaType: string } | null;
}

const FONT_ALGORITHMS = new Set([
  "http://www.idpf.org/2008/embedding",
  "http://ns.adobe.com/pdf/enc#RC",
]);

const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

// Zip-bomb guard, checked in the inflate filter so big entries never load.
export function assertEntrySize(originalSize: number | undefined): void {
  if (typeof originalSize === "number" && originalSize > MAX_ENTRY_BYTES) {
    throw new EpubError("unreadable");
  }
}

function inflateOnly(zip: Uint8Array, names: Set<string>): Record<string, Uint8Array> {
  const out = unzipSync(zip, {
    filter: (file) => {
      if (!names.has(file.name)) return false;
      assertEntrySize(file.originalSize);
      return true;
    },
  }) as Record<string, Uint8Array>;
  for (const name of Object.keys(out)) assertEntrySize(out[name]?.length);
  return out;
}

function parseXml(text: string): Document {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch {
    throw new EpubError("unreadable");
  }
  if (doc.getElementsByTagName("parsererror").length > 0) throw new EpubError("unreadable");
  return doc;
}

function elsByLocal(scope: Document | Element, local: string): Element[] {
  const found = scope.getElementsByTagName("*");
  const out: Element[] = [];
  for (let i = 0; i < found.length; i++) {
    const el = found[i];
    if (el && el.localName === local) out.push(el);
  }
  return out;
}

function directChildren(el: Element, local: string): Element[] {
  return Array.from(el.children).filter((child) => child.localName === local);
}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

// Gutenberg boilerplate (front matter, edition notices) carries no story.
function normLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFrontMatter(label: string, title: string): boolean {
  const norm = normLabel(label);
  if (norm === "contents" || norm === "table of contents") return true;
  if (norm.includes("project gutenberg")) return true;
  const normTitle = normLabel(title);
  if (normTitle.length > 0 && norm === normTitle) return true;
  return false;
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// OPF hrefs resolve against the OPF directory; decode %20 and drop #fragments.
function resolveHref(opfPath: string, href: string): string {
  let path = href.split("#")[0] ?? "";
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path when decoding fails.
  }
  const dir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  for (const seg of (dir + path).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function hasTocType(el: Element): boolean {
  const direct = el.getAttribute("epub:type") ?? el.getAttribute("type") ?? "";
  if (direct.split(/\s+/).includes("toc")) return true;
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr && attr.localName === "type" && attr.value.split(/\s+/).includes("toc")) return true;
  }
  return false;
}

function navChapters(doc: Document): string[] | null {
  const nav = elsByLocal(doc, "nav").find(hasTocType);
  const ol = nav ? elsByLocal(nav, "ol")[0] : undefined;
  if (!ol) return null;
  const labels = directChildren(ol, "li").map((li) => clean(elsByLocal(li, "a")[0]?.textContent));
  const kept = labels.filter((label) => label.length > 0);
  return kept.length > 0 ? kept : null;
}

function ncxChapters(doc: Document): string[] {
  const map = elsByLocal(doc, "navMap")[0];
  if (!map) return [];
  return directChildren(map, "navPoint")
    .map((point) => clean(elsByLocal(directChildren(point, "navLabel")[0] ?? point, "text")[0]?.textContent))
    .filter((label) => label.length > 0);
}

// Counts every word; long books route to BYOK in the UI, never an error.
function countWords(text: string, start: number): number {
  WORD_RE.lastIndex = 0;
  let count = start;
  let match: RegExpExecArray | null;
  while ((match = WORD_RE.exec(text)) !== null && match[0].length > 0) {
    count += 1;
  }
  return count;
}

function bodyText(doc: Document): string {
  return elsByLocal(doc, "body")[0]?.textContent ?? doc.documentElement?.textContent ?? "";
}

function spineText(docText: string): string {
  try {
    return bodyText(parseXml(docText));
  } catch {
    const doc = new DOMParser().parseFromString(docText, "text/html");
    return bodyText(doc);
  }
}

export function parseEpub(bytes: Uint8Array): EpubBook {
  if (bytes.length > MAX_EPUB_BYTES) throw new EpubError("too_large");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new EpubError("not_epub");
  }

  let first: Record<string, Uint8Array>;
  try {
    first = inflateOnly(
      bytes,
      new Set(["mimetype", "META-INF/container.xml", "META-INF/encryption.xml", "META-INF/rights.xml"]),
    );
  } catch (err) {
    if (err instanceof EpubError) throw err;
    throw new EpubError("unreadable");
  }

  const mimetype = first["mimetype"] ? clean(decode(first["mimetype"] as Uint8Array)) : "";
  if (mimetype !== "application/epub+zip") throw new EpubError("not_epub");
  if (first["META-INF/rights.xml"]) throw new EpubError("drm");

  const encryption = first["META-INF/encryption.xml"];
  if (encryption) {
    const doc = parseXml(decode(encryption));
    for (const method of elsByLocal(doc, "EncryptionMethod")) {
      if (!FONT_ALGORITHMS.has(method.getAttribute("Algorithm") ?? "")) throw new EpubError("drm");
    }
  }

  const container = first["META-INF/container.xml"];
  if (!container) throw new EpubError("unreadable");
  const opfPath = elsByLocal(parseXml(decode(container)), "rootfile")[0]?.getAttribute("full-path");
  if (!opfPath) throw new EpubError("unreadable");

  let opfBytes: Record<string, Uint8Array>;
  try {
    opfBytes = inflateOnly(bytes, new Set([opfPath]));
  } catch (err) {
    if (err instanceof EpubError) throw err;
    throw new EpubError("unreadable");
  }
  const opfRaw = opfBytes[opfPath];
  if (!opfRaw) throw new EpubError("unreadable");
  const opf = parseXml(decode(opfRaw));

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const item of elsByLocal(opf, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) {
      manifest.set(id, {
        href: resolveHref(opfPath, href),
        mediaType: item.getAttribute("media-type") ?? "",
        properties: item.getAttribute("properties") ?? "",
      });
    }
  }
  const spine = elsByLocal(opf, "spine")[0];
  const tocId = spine?.getAttribute("toc") ?? "";
  const spineRefs = elsByLocal(opf, "itemref")
    .filter((ref) => ref.getAttribute("linear") !== "no")
    .map((ref) => ref.getAttribute("idref") ?? "");

  const wanted = new Set<string>();
  let navPath: string | null = null;
  for (const item of manifest.values()) {
    if (item.properties.split(/\s+/).includes("nav")) navPath = item.href;
  }
  if (navPath) wanted.add(navPath);
  let ncxPath: string | null = null;
  const tocItem = tocId ? manifest.get(tocId) : undefined;
  if (tocItem) ncxPath = tocItem.href;
  else {
    for (const item of manifest.values()) {
      if (item.mediaType === "application/x-dtbnc+xml" || item.mediaType === "application/x-dtbncx+xml") {
        ncxPath = item.href;
      }
    }
  }
  if (ncxPath) wanted.add(ncxPath);

  let coverPath: string | null = null;
  let coverType = "";
  for (const item of manifest.values()) {
    if (item.properties.split(/\s+/).includes("cover-image")) {
      coverPath = item.href;
      coverType = item.mediaType;
    }
  }
  if (!coverPath) {
    const coverId = elsByLocal(opf, "meta").find((m) => m.getAttribute("name") === "cover")?.getAttribute("content");
    const coverItem = coverId ? manifest.get(coverId) : undefined;
    if (coverItem) {
      coverPath = coverItem.href;
      coverType = coverItem.mediaType;
    }
  }
  if (coverPath && COVER_TYPES.has(coverType)) wanted.add(coverPath);
  else coverPath = null;

  const spinePaths: string[] = [];
  for (const idref of spineRefs) {
    const item = manifest.get(idref);
    if (item && (item.mediaType === "application/xhtml+xml" || item.mediaType === "text/html")) {
      wanted.add(item.href);
      spinePaths.push(item.href);
    }
  }

  let rest: Record<string, Uint8Array>;
  try {
    rest = inflateOnly(bytes, wanted);
  } catch (err) {
    if (err instanceof EpubError) throw err;
    throw new EpubError("unreadable");
  }

  let chapters: string[] = [];
  const navRaw = navPath ? rest[navPath] : undefined;
  if (navRaw) chapters = navChapters(parseXml(decode(navRaw))) ?? [];
  if (chapters.length === 0) {
    const ncxRaw = ncxPath ? rest[ncxPath] : undefined;
    if (ncxRaw) chapters = ncxChapters(parseXml(decode(ncxRaw)));
  }

  let words = 0;
  let inflated = 0;
  for (const path of spinePaths) {
    const raw = rest[path];
    if (!raw) continue;
    inflated += raw.length;
    if (inflated > MAX_INFLATED_BYTES) throw new EpubError("unreadable");
    words = countWords(spineText(decode(raw)), words);
  }

  const metadata = elsByLocal(opf, "metadata")[0];
  let title = "Untitled";
  let author: string | null = null;
  if (metadata) {
    const dcTitle =
      metadata.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "title")[0]?.textContent ??
      elsByLocal(metadata, "title")[0]?.textContent;
    const cleaned = clean(dcTitle);
    if (cleaned) title = cleaned;
    const dcCreator =
      metadata.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "creator")[0]?.textContent ??
      elsByLocal(metadata, "creator")[0]?.textContent;
    const cleanedAuthor = clean(dcCreator);
    author = cleanedAuthor ? cleanedAuthor : null;
  }

  const coverRaw = coverPath ? rest[coverPath] : undefined;
  return {
    title,
    author,
    chapters: chapters.filter((label) => !isFrontMatter(label, title)).slice(0, 500),
    words,
    cover: coverRaw ? { bytes: coverRaw, mediaType: coverType } : null,
  };
}

export async function readEpubFile(file: File): Promise<EpubBook> {
  if (file.size > MAX_EPUB_BYTES) throw new EpubError("too_large");
  return parseEpub(new Uint8Array(await file.arrayBuffer()));
}
