import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { JSDOM } from "jsdom";
import { readEpubSections } from "./epub-sections";
import type { XmlParser } from "./epub-sections";

const parse: XmlParser = (text, type) =>
  type === "text/html" ? new JSDOM(text).window.document : new JSDOM(text, { contentType: type }).window.document;

const NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"';

function book(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) encoded[name] = new TextEncoder().encode(text);
  return zipSync(encoded);
}

function container(opf = "OEBPS/content.opf"): string {
  return `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opf}" media-type="application/oebps-package+xml"/></rootfiles></container>`;
}

function opf(manifest: string, spine: string): string {
  return `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tiny Book</dc:title><dc:creator>A Writer</dc:creator></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`;
}

const item = (id: string, href: string, media = "application/xhtml+xml", props = ""): string =>
  `<item id="${id}" href="${href}" media-type="${media}"${props === "" ? "" : ` properties="${props}"`}/>`;

const tiny: Record<string, string> = {
  "META-INF/container.xml": container(),
  "OEBPS/content.opf": opf(
    [
      item("nav", "nav.xhtml", "application/xhtml+xml", "nav"),
      item("ch1", "ch1.xhtml"),
      item("ch2", "ch2.xhtml"),
      item("ch3", "ch3.xhtml"),
      item("ch4", "ch4.xhtml"),
    ].join(""),
    '<itemref idref="ch1"/><itemref idref="ch2" linear="no"/><itemref idref="ch3"/><itemref idref="ch4"/>',
  ),
  "OEBPS/nav.xhtml": `<html ${NS}><head><title>Nav</title></head><body><nav epub:type="toc"><a href="ch1.xhtml">Chapter One</a><a href="ch3.xhtml">Chapter Three</a></nav></body></html>`,
  "OEBPS/ch1.xhtml": `<html ${NS}><head><title>Ch One</title></head><body epub:type="bodymatter"><section epub:type="chapter"><h1>One</h1><div><p>First<br/>paragraph.</p><p>Second.</p></div></section></body></html>`,
  "OEBPS/ch2.xhtml": `<html ${NS}><head><title>Ch Two</title></head><body><h1>Two</h1><p>Hidden.</p></body></html>`,
  "OEBPS/ch3.xhtml": `<html ${NS}><head><title>Ch Three</title></head><body><div id="pg-header"><p>junk</p></div><h1>Three<br/>Lines</h1><p>Body.</p></body></html>`,
  "OEBPS/ch4.xhtml": `<html><head><title>Ch Four</title></head><body><p>unclosed`,
};

describe("readEpubSections", () => {
  it("reads spine sections with types, blocks, nav labels, and linear flags", () => {
    const { title, author, sections } = readEpubSections(book(tiny), parse);
    expect(title).toBe("Tiny Book");
    expect(author).toBe("A Writer");
    expect(sections.map((s) => s.id)).toEqual([
      "OEBPS/ch1.xhtml",
      "OEBPS/ch2.xhtml",
      "OEBPS/ch3.xhtml",
      "OEBPS/ch4.xhtml",
    ]);
    const [ch1, ch2, ch3, ch4] = sections;
    expect(ch1?.types).toEqual(["bodymatter", "chapter"]);
    expect(ch1?.linear).toBe(true);
    expect(ch1?.docTitle).toBe("Ch One");
    expect(ch1?.navLabel).toBe("Chapter One");
    expect(ch1?.blocks).toEqual([
      { text: "One", heading: true },
      { text: "First paragraph.", heading: false },
      { text: "Second.", heading: false },
    ]);
    expect(ch2?.linear).toBe(false);
    expect(ch2?.navLabel).toBeNull();
    expect(ch3?.blocks).toEqual([
      { text: "Three Lines", heading: true },
      { text: "Body.", heading: false },
    ]);
    expect(ch4?.blocks.length).toBeGreaterThan(0);
  });

  it("keeps the first nav label when entries share a file", () => {
    const files: Record<string, string> = {
      "META-INF/container.xml": container(),
      "OEBPS/content.opf": opf(
        [item("ncx", "toc.ncx", "application/x-dtbncx+xml"), item("ch24", "ch24.xhtml")].join(""),
        '<itemref idref="ch24"/>',
      ),
      "OEBPS/toc.ncx": `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>The Riches of Content</text></navLabel><content src="ch24.xhtml"/></navPoint><navPoint id="n2"><navLabel><text>THE FULL PROJECT GUTENBERG LICENSE</text></navLabel><content src="ch24.xhtml"/></navPoint></navMap></ncx>`,
      "OEBPS/ch24.xhtml": `<html ${NS}><head><title>The Riches of Content</title></head><body><h1>The Riches of Content</h1><p>Story.</p></body></html>`,
    };
    const { sections } = readEpubSections(book(files), parse);
    expect(sections[0]?.navLabel).toBe("The Riches of Content");
  });

  it("reads NCX labels for EPUB2 books", () => {
    const files: Record<string, string> = {
      "META-INF/container.xml": container(),
      "OEBPS/content.opf": opf(
        [item("ncx", "toc.ncx", "application/x-dtbncx+xml"), item("ch1", "ch1.xhtml")].join(""),
        '<itemref idref="ch1"/>',
      ),
      "OEBPS/toc.ncx": `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>One</text></navLabel><content src="ch1.xhtml"/></navPoint></navMap></ncx>`,
      "OEBPS/ch1.xhtml": `<html ${NS}><head><title>C1</title></head><body><p>Hi.</p></body></html>`,
    };
    const { sections } = readEpubSections(book(files), parse);
    expect(sections[0]?.navLabel).toBe("One");
  });

  it("rejects non-epubs, oversize input, and DRM", () => {
    expect(() => readEpubSections(new Uint8Array([1, 2, 3]), parse)).toThrow("not_epub");
    expect(() => readEpubSections(new Uint8Array(20 * 1024 * 1024 + 1), parse)).toThrow("too_large");
    expect(() => readEpubSections(book({ ...tiny, "META-INF/rights.xml": "<rights/>" }), parse)).toThrow("drm");
    const enc = `<?xml version="1.0"?><encryption xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OEBPS/ch1.xhtml"/></CipherData></EncryptedData></encryption>`;
    expect(() => readEpubSections(book({ ...tiny, "META-INF/encryption.xml": enc }), parse)).toThrow("drm");
  });

  it("allows font-only encryption and rejects oversize entries", () => {
    const fontEnc = `<?xml version="1.0"?><encryption xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="font.otf"/></CipherData></EncryptedData></encryption>`;
    expect(() => readEpubSections(book({ ...tiny, "META-INF/encryption.xml": fontEnc }), parse)).not.toThrow();
    const big: Record<string, string> = { ...tiny, "OEBPS/big.xhtml": "x".repeat(9 * 1024 * 1024) };
    big["OEBPS/content.opf"] = opf(
      [item("ch1", "ch1.xhtml"), item("big", "big.xhtml")].join(""),
      '<itemref idref="ch1"/><itemref idref="big"/>',
    );
    expect(() => readEpubSections(book(big), parse)).toThrow("unreadable");
  });
});
