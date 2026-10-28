// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  EPUB_ERROR_MESSAGES,
  EpubError,
  MAX_EPUB_BYTES,
  assertEntrySize,
  parseEpub,
  readEpubFile,
  readEpubSections,
} from "./epub";

const PNG_1X1 = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
  0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10,
  45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function chapterDoc(heading: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>C</title></head><body><h1>${heading}</h1><p>${body}</p></body></html>`;
}

function epub3(opf: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(CONTAINER),
    "OEBPS/content.opf": strToU8(opf),
    ...extra,
  });
}

const OPF3 = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>  The Wonderful Wizard of Oz </dc:title>
    <dc:creator>L. Frank Baum</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="ch1"/><itemref idref="ch2"/><itemref idref="ch3"/></spine>
</package>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Toc</title></head><body><nav epub:type="toc"><ol>
<li><a href="ch1.xhtml">Chapter I. The Cyclone</a></li>
<li><a href="ch2.xhtml">Chapter II. The Council with the Munchkins</a></li>
<li><a href="ch3.xhtml">Chapter III. How Dorothy Saved the Scarecrow</a></li>
</ol></nav></body></html>`;

function tinyEpub3(): Uint8Array {
  return epub3(OPF3, {
    "OEBPS/nav.xhtml": strToU8(NAV),
    "OEBPS/ch1.xhtml": strToU8(chapterDoc("Chapter I. The Cyclone", "alpha beta gamma")),
    "OEBPS/ch2.xhtml": strToU8(chapterDoc("Chapter II. The Council with the Munchkins", "delta epsilon")),
    "OEBPS/ch3.xhtml": strToU8(chapterDoc("Chapter III. How Dorothy Saved the Scarecrow", "zeta")),
    "OEBPS/cover.png": PNG_1X1,
  });
}

function tinyEpub2(): Uint8Array {
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Oz Two</dc:title>
    <dc:creator>Baum</dc:creator>
    <meta name="cover" content="cover"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="cover.png" media-type="image/png"/>
  </manifest>
  <spine toc="ncx"><itemref idref="ch1"/></spine>
</package>`;
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
<navPoint id="a"><navLabel><text>First</text></navLabel><content src="ch1.xhtml"/></navPoint>
<navPoint id="b"><navLabel><text>Second</text></navLabel><content src="ch1.xhtml"/></navPoint>
</navMap></ncx>`;
  return epub3(opf, {
    "OEBPS/toc.ncx": strToU8(ncx),
    "OEBPS/ch1.xhtml": strToU8(chapterDoc("First", "hello world")),
    "OEBPS/cover.png": PNG_1X1,
  });
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof EpubError) return err.code;
    throw err;
  }
  throw new Error("expected an EpubError");
}

describe("parseEpub", () => {
  it("parses an EPUB 3: title, author, chapters, words, cover", () => {
    const book = parseEpub(tinyEpub3());
    expect(book.title).toBe("The Wonderful Wizard of Oz");
    expect(book.author).toBe("L. Frank Baum");
    expect(book.chapters).toEqual(["The Cyclone", "The Council with the Munchkins", "How Dorothy Saved the Scarecrow"]);
    expect(book.words).toBe(6);
    expect(book.cover?.mediaType).toBe("image/png");
    expect(book.cover?.bytes.length).toBeGreaterThan(0);
  });

  it("parses an EPUB 2 with NCX and meta cover", () => {
    const book = parseEpub(tinyEpub2());
    expect(book.title).toBe("Oz Two");
    expect(book.author).toBe("Baum");
    expect(book.chapters).toEqual(["First"]);
    expect(book.words).toBe(2);
    expect(book.cover?.mediaType).toBe("image/png");
  });

  it("drops the title-page edition line Alice carries in its nav", () => {
    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Alice&#8217;s Adventures in Wonderland</dc:title>
    <dc:creator>Lewis Carroll</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="title"/><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`;
    const nav =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">` +
      `<head><title>Toc</title></head><body><nav epub:type="toc"><ol>` +
      `<li><a href="title.xhtml">THE MILLENNIUM FULCRUM EDITION 3.0</a></li>` +
      `<li><a href="ch1.xhtml">CHAPTER I. Down the Rabbit-Hole</a></li>` +
      `<li><a href="ch2.xhtml">CHAPTER II. The Pool of Tears</a></li>` +
      `</ol></nav></body></html>`;
    const titleDoc =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Alice&#8217;s Adventures in Wonderland</title></head><body>` +
      `<p>THE MILLENNIUM FULCRUM EDITION 3.0</p><p>Second Edition</p><p>Illustrated Edition</p>` +
      `<p>Printed in Great Britain</p><p>All rights reserved</p>` +
      `</body></html>`;
    const book = parseEpub(
      epub3(opf, {
        "OEBPS/nav.xhtml": strToU8(nav),
        "OEBPS/title.xhtml": strToU8(titleDoc),
        "OEBPS/ch1.xhtml": strToU8(chapterDoc("CHAPTER I. Down the Rabbit-Hole", "Alice was beginning to get very tired.")),
        "OEBPS/ch2.xhtml": strToU8(chapterDoc("CHAPTER II. The Pool of Tears", "Curiouser and curiouser cried Alice.")),
        "OEBPS/cover.png": PNG_1X1,
      }),
    );
    expect(book.chapters).toEqual(["Down the Rabbit-Hole", "The Pool of Tears"]);
    expect(book.words).toBe(12);
  });

  it("rejects non-EPUBs", () => {
    expect(codeOf(() => parseEpub(new Uint8Array([1, 2, 3, 4])))).toBe("not_epub");
    expect(codeOf(() => parseEpub(zipSync({ "META-INF/container.xml": strToU8(CONTAINER) })))).toBe("not_epub");
    const tampered = zipSync({
      mimetype: strToU8("text/plain"),
      "META-INF/container.xml": strToU8(CONTAINER),
      "OEBPS/content.opf": strToU8(OPF3),
      "OEBPS/nav.xhtml": strToU8(NAV),
    });
    expect(codeOf(() => parseEpub(tampered))).toBe("not_epub");
  });

  it("refuses copy-protected books but allows font obfuscation", () => {
    const rights = epub3(OPF3, {
      "META-INF/rights.xml": strToU8("<rights/>"),
      "OEBPS/nav.xhtml": strToU8(NAV),
      "OEBPS/ch1.xhtml": strToU8(chapterDoc("One", "x")),
    });
    expect(codeOf(() => parseEpub(rights))).toBe("drm");
    const aes =
      `<encryption xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptedData>` +
      `<EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>`;
    const fonts =
      `<encryption xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptedData>` +
      `<EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>`;
    const enc = (xml: string) =>
      epub3(OPF3, {
        "META-INF/encryption.xml": strToU8(xml),
        "OEBPS/nav.xhtml": strToU8(NAV),
        "OEBPS/ch1.xhtml": strToU8(chapterDoc("One", "x")),
      });
    expect(codeOf(() => parseEpub(enc(aes)))).toBe("drm");
    expect(parseEpub(enc(fonts)).chapters).toHaveLength(1);
  });

  it("counts long books fully instead of rejecting them", () => {
    const big = epub3(OPF3, {
      "OEBPS/nav.xhtml": strToU8(NAV),
      "OEBPS/ch1.xhtml": strToU8(chapterDoc("Chapter I. The Cyclone", `${"word ".repeat(60_000)}`)),
      "OEBPS/ch2.xhtml": strToU8(chapterDoc("Chapter II. The Council with the Munchkins", "x")),
      "OEBPS/ch3.xhtml": strToU8(chapterDoc("Chapter III. How Dorothy Saved the Scarecrow", "x")),
    });
    expect(parseEpub(big).words).toBe(60_002);
  });

  it("reports broken books as unreadable", () => {
    const broken = epub3("this is not < xml", {
      "OEBPS/nav.xhtml": strToU8(NAV),
      "OEBPS/ch1.xhtml": strToU8(chapterDoc("One", "x")),
    });
    expect(codeOf(() => parseEpub(broken))).toBe("unreadable");
    expect(() => assertEntrySize(8 * 1024 * 1024 + 1)).toThrow(EpubError);
    expect(() => assertEntrySize(100)).not.toThrow();
  });

  it("has warm copy for every code", () => {
    for (const code of ["not_epub", "too_large", "drm", "unreadable"] as const) {
      expect(EPUB_ERROR_MESSAGES[code].length).toBeGreaterThan(20);
    }
  });
});

describe("readEpubFile", () => {
  it("checks size before reading", async () => {
    let read = false;
    const fake = {
      size: MAX_EPUB_BYTES + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    } as unknown as File;
    await expect(readEpubFile(fake)).rejects.toMatchObject({ code: "too_large" });
    expect(read).toBe(false);
  });

  it("parses a small file", async () => {
    const bytes = tinyEpub3();
    const fake = {
      size: bytes.length,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    } as unknown as File;
    const book = await readEpubFile(fake);
    expect(book.title).toBe("The Wonderful Wizard of Oz");
  });
});

const NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"';

function secBook(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) encoded[name] = new TextEncoder().encode(text);
  return zipSync(encoded);
}

function secContainer(opf = "OEBPS/content.opf"): string {
  return `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${opf}" media-type="application/oebps-package+xml"/></rootfiles></container>`;
}

function secOpf(manifest: string, spine: string): string {
  return `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tiny Book</dc:title><dc:creator>A Writer</dc:creator></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`;
}

const secItem = (id: string, href: string, media = "application/xhtml+xml", props = ""): string =>
  `<item id="${id}" href="${href}" media-type="${media}"${props === "" ? "" : ` properties="${props}"`}/>`;

const secTiny: Record<string, string> = {
  "META-INF/container.xml": secContainer(),
  "OEBPS/content.opf": secOpf(
    [
      secItem("nav", "nav.xhtml", "application/xhtml+xml", "nav"),
      secItem("ch1", "ch1.xhtml"),
      secItem("ch2", "ch2.xhtml"),
      secItem("ch3", "ch3.xhtml"),
      secItem("ch4", "ch4.xhtml"),
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
    const { title, author, sections } = readEpubSections(secBook(secTiny));
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
      "META-INF/container.xml": secContainer(),
      "OEBPS/content.opf": secOpf(
        [secItem("ncx", "toc.ncx", "application/x-dtbncx+xml"), secItem("ch24", "ch24.xhtml")].join(""),
        '<itemref idref="ch24"/>',
      ),
      "OEBPS/toc.ncx": `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>The Riches of Content</text></navLabel><content src="ch24.xhtml"/></navPoint><navPoint id="n2"><navLabel><text>THE FULL PROJECT GUTENBERG LICENSE</text></navLabel><content src="ch24.xhtml"/></navPoint></navMap></ncx>`,
      "OEBPS/ch24.xhtml": `<html ${NS}><head><title>The Riches of Content</title></head><body><h1>The Riches of Content</h1><p>Story.</p></body></html>`,
    };
    const { sections } = readEpubSections(secBook(files));
    expect(sections[0]?.navLabel).toBe("The Riches of Content");
  });

  it("reads NCX labels for EPUB2 books", () => {
    const files: Record<string, string> = {
      "META-INF/container.xml": secContainer(),
      "OEBPS/content.opf": secOpf(
        [secItem("ncx", "toc.ncx", "application/x-dtbncx+xml"), secItem("ch1", "ch1.xhtml")].join(""),
        '<itemref idref="ch1"/>',
      ),
      "OEBPS/toc.ncx": `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>One</text></navLabel><content src="ch1.xhtml"/></navPoint></navMap></ncx>`,
      "OEBPS/ch1.xhtml": `<html ${NS}><head><title>C1</title></head><body><p>Hi.</p></body></html>`,
    };
    const { sections } = readEpubSections(secBook(files));
    expect(sections[0]?.navLabel).toBe("One");
  });

  it("rejects non-epubs, oversize input, and DRM", () => {
    expect(() => readEpubSections(new Uint8Array([1, 2, 3]))).toThrow("not_epub");
    expect(() => readEpubSections(new Uint8Array(20 * 1024 * 1024 + 1))).toThrow("too_large");
    expect(() => readEpubSections(secBook({ ...secTiny, "META-INF/rights.xml": "<rights/>" }))).toThrow("drm");
    const enc = `<?xml version="1.0"?><encryption xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OEBPS/ch1.xhtml"/></CipherData></EncryptedData></encryption>`;
    expect(() => readEpubSections(secBook({ ...secTiny, "META-INF/encryption.xml": enc }))).toThrow("drm");
  });

  it("allows font-only encryption and rejects oversize entries", () => {
    const fontEnc = `<?xml version="1.0"?><encryption xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="font.otf"/></CipherData></EncryptedData></encryption>`;
    expect(() => readEpubSections(secBook({ ...secTiny, "META-INF/encryption.xml": fontEnc }))).not.toThrow();
    const big: Record<string, string> = { ...secTiny, "OEBPS/big.xhtml": "x".repeat(9 * 1024 * 1024) };
    big["OEBPS/content.opf"] = secOpf(
      [secItem("ch1", "ch1.xhtml"), secItem("big", "big.xhtml")].join(""),
      '<itemref idref="ch1"/><itemref idref="big"/>',
    );
    expect(() => readEpubSections(secBook(big))).toThrow("unreadable");
  });
});
