// shortcut: duplicates task 20's core/epub.ts guards, merge into it once that lands.
import { unzipSync } from "fflate";
import type { RawSection } from "./clean";

export type XmlParser = (
  text: string,
  type: "application/xhtml+xml" | "text/html" | "application/xml",
) => Document;

export interface EpubBook {
  title: string;
  author: string | null;
  sections: RawSection[];
}

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

const BLOCK_TAGS = ["p", "div", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "td", "dt", "dd", "pre", "figcaption"];
const BLOCK_SELECTOR = BLOCK_TAGS.join(",");
const FONT_ALG = "http://www.idpf.org/2008/embedding";

function byTag(doc: Document, name: string): Element[] {
  return [...doc.getElementsByTagName(name)];
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

// META-INF/rights.xml means Adobe DRM. An encryption.xml that lists
// anything but font obfuscation means the content is encrypted.
function assertNoDrm(files: Record<string, Uint8Array>, parse: XmlParser): void {
  if ("META-INF/rights.xml" in files) throw new Error("drm");
  const enc = files["META-INF/encryption.xml"];
  if (enc === undefined) return;
  const doc = parse(new TextDecoder().decode(enc), "application/xml");
  const algs = byTag(doc, "EncryptionMethod").map((el) => el.getAttribute("Algorithm") ?? "");
  if (algs.length > 0 && algs.some((a) => a !== FONT_ALG)) throw new Error("drm");
}

function opfDir(opfPath: string): string {
  const slash = opfPath.lastIndexOf("/");
  return slash === -1 ? "" : opfPath.slice(0, slash + 1);
}

function navLabels(doc: Document, fileOf: (href: string) => string): Map<string, string> {
  const labels = new Map<string, string>();
  const navs = byTag(doc, "nav");
  const toc = navs.find((nav) => (nav.getAttribute("epub:type") ?? "").split(/\s+/).includes("toc")) ?? navs[0] ?? null;
  const scope = toc ?? doc.documentElement;
  if (scope === null || scope === undefined) return labels;
  for (const a of [...scope.getElementsByTagName("a")]) {
    const href = a.getAttribute("href");
    if (href === null) continue;
    // First label wins: several nav entries can point at one file (the
    // license entry may share the last chapter file), and the first in
    // document order names the chapter.
    const key = fileOf(href.split("#")[0] ?? "");
    if (!labels.has(key)) labels.set(key, textOf(a));
  }
  return labels;
}

function ncxLabels(doc: Document, fileOf: (href: string) => string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const point of byTag(doc, "navPoint")) {
    const label = point.getElementsByTagName("navLabel")[0];
    const content = point.getElementsByTagName("content")[0];
    const src = content?.getAttribute("src");
    if (label !== undefined && src !== undefined && src !== null) {
      const key = fileOf(src.split("#")[0] ?? "");
      if (!labels.has(key)) labels.set(key, textOf(label));
    }
  }
  return labels;
}

function epubTypes(el: Element): string[] {
  const raw = [el.getAttribute("epub:type"), el.getAttributeNS("http://www.idpf.org/2007/ops", "type")];
  const out: string[] = [];
  for (const value of raw) {
    if (value !== null) out.push(...value.split(/\s+/).filter((t) => t.length > 0));
  }
  return [...new Set(out)];
}

function spineBlocks(doc: Document): { text: string; heading: boolean }[] {
  for (const el of doc.querySelectorAll("script, style")) el.remove();
  for (const el of doc.querySelectorAll("[id]")) {
    const id = el.getAttribute("id") ?? "";
    if (id.startsWith("pg-") || id === "project-gutenberg-license") el.remove();
  }
  for (const br of doc.getElementsByTagName("br")) br.replaceWith(doc.createTextNode(" "));
  const blocks: { text: string; heading: boolean }[] = [];
  for (const el of [...doc.querySelectorAll(BLOCK_SELECTOR)]) {
    if (el.querySelector(BLOCK_SELECTOR) !== null) continue; // keep leaf blocks only
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;
    blocks.push({ text, heading: /^h[1-6]$/i.test(el.tagName) });
  }
  return blocks;
}

export function readEpubSections(bytes: Uint8Array, parse: XmlParser): EpubBook {
  if (bytes.length > MAX_INPUT_BYTES) throw new Error("too_large");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (entry) => entry.originalSize <= MAX_ENTRY_BYTES });
  } catch {
    throw new Error("not_epub");
  }
  let total = 0;
  for (const data of Object.values(files)) total += data.length;
  if (total > MAX_TOTAL_BYTES) throw new Error("too_large");
  const decode = (name: string): string => new TextDecoder().decode(files[name]);
  assertNoDrm(files, parse);
  if (!("META-INF/container.xml" in files)) throw new Error("not_epub");
  const rootfile = byTag(parse(decode("META-INF/container.xml"), "application/xml"), "rootfile")[0];
  const opfPath = rootfile?.getAttribute("full-path");
  if (opfPath === undefined || opfPath === null || !(opfPath in files)) throw new Error("unreadable");
  const dir = opfDir(opfPath);
  const opf = parse(decode(opfPath), "application/xml");
  const title = textOf(byTag(opf, "dc:title")[0] ?? null) || "Untitled";
  const authorRaw = textOf(byTag(opf, "dc:creator")[0] ?? null);
  const hrefOf = new Map<string, { href: string; media: string; properties: string }>();
  const manifest = byTag(opf, "manifest")[0];
  if (manifest !== undefined) {
    for (const item of [...manifest.getElementsByTagName("item")]) {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id !== null && href !== null) {
        hrefOf.set(id, {
          href,
          media: item.getAttribute("media-type") ?? "",
          properties: item.getAttribute("properties") ?? "",
        });
      }
    }
  }
  const spine = byTag(opf, "spine")[0];
  const refs = spine === undefined ? [] : [...spine.getElementsByTagName("itemref")];
  if (refs.length === 0) throw new Error("unreadable");
  const entryOf = (href: string): string => dir + href;
  const fileOf = (href: string): string => href;
  let labels = new Map<string, string>();
  for (const { href } of hrefOf.values()) {
    if (!/\.ncx$/i.test(href)) continue;
    const name = entryOf(href);
    if (name in files) {
      labels = ncxLabels(parse(decode(name), "application/xml"), fileOf);
      break;
    }
  }
  for (const { href, media, properties } of hrefOf.values()) {
    if (!properties.split(/\s+/).includes("nav")) continue;
    if (media !== "" && media !== "application/xhtml+xml" && !/\.x?html?$/i.test(href)) continue;
    const name = entryOf(href);
    if (!(name in files)) continue;
    labels = navLabels(parse(decode(name), "application/xhtml+xml"), fileOf);
    break;
  }
  const sections: RawSection[] = [];
  for (const ref of refs) {
    const idref = ref.getAttribute("idref");
    const manifestItem = idref === null ? undefined : hrefOf.get(idref);
    if (manifestItem === undefined) throw new Error("unreadable");
    if (manifestItem.media !== "" && manifestItem.media !== "application/xhtml+xml") continue;
    const name = entryOf(manifestItem.href);
    const data = files[name];
    if (data === undefined) throw new Error("unreadable");
    const text = new TextDecoder().decode(data);
    let doc: Document;
    try {
      doc = parse(text, "application/xhtml+xml");
      if (doc.getElementsByTagName("parsererror").length > 0) doc = parse(text, "text/html");
    } catch {
      try {
        doc = parse(text, "text/html");
      } catch {
        sections.push({
          id: name,
          href: manifestItem.href,
          linear: true,
          types: [],
          docTitle: null,
          navLabel: labels.get(manifestItem.href) ?? labels.get(manifestItem.href.split("/").pop() ?? "") ?? null,
          blocks: [],
        });
        continue;
      }
    }
    const body = doc.getElementsByTagName("body")[0] ?? doc.documentElement;
    const types = body === undefined ? [] : epubTypes(body);
    if (body !== undefined) {
      for (const child of [...body.children]) {
        if (["section", "article", "div"].includes(child.tagName.toLowerCase())) {
          types.push(...epubTypes(child));
        }
      }
    }
    const titleEl = doc.getElementsByTagName("title")[0];
    const docTitle = titleEl === undefined ? null : textOf(titleEl) || null;
    const navLabel =
      labels.get(manifestItem.href) ?? labels.get(manifestItem.href.split("/").pop() ?? "") ?? null;
    sections.push({
      id: name,
      href: manifestItem.href,
      linear: ref.getAttribute("linear") !== "no",
      types: [...new Set(types)],
      docTitle,
      navLabel,
      blocks: spineBlocks(doc),
    });
  }
  return { title, author: authorRaw === "" ? null : authorRaw, sections };
}
