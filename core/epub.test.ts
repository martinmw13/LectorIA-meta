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

function chapterDoc(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>C</title></head><body><p>${body}</p></body></html>`;
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
    "OEBPS/ch1.xhtml": strToU8(chapterDoc("alpha beta gamma")),
    "OEBPS/ch2.xhtml": strToU8(chapterDoc("delta epsilon")),
    "OEBPS/ch3.xhtml": strToU8(chapterDoc("zeta")),
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
    "OEBPS/ch1.xhtml": strToU8(chapterDoc("hello world")),
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
    expect(book.chapters).toEqual([
      "Chapter I. The Cyclone",
      "Chapter II. The Council with the Munchkins",
      "Chapter III. How Dorothy Saved the Scarecrow",
    ]);
    expect(book.words).toBe(6);
    expect(book.cover?.mediaType).toBe("image/png");
    expect(book.cover?.bytes.length).toBeGreaterThan(0);
  });

  it("parses an EPUB 2 with NCX and meta cover", () => {
    const book = parseEpub(tinyEpub2());
    expect(book.title).toBe("Oz Two");
    expect(book.author).toBe("Baum");
    expect(book.chapters).toEqual(["First", "Second"]);
    expect(book.words).toBe(2);
    expect(book.cover?.mediaType).toBe("image/png");
  });

  it("drops Gutenberg front matter from chapter labels", () => {
    const opf = OPF3.replace(
      "The Wonderful Wizard of Oz",
      "Alice&#8217;s Adventures in Wonderland",
    ).replace("L. Frank Baum", "Lewis Carroll");
    const nav =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">` +
      `<head><title>Toc</title></head><body><nav epub:type="toc"><ol>` +
      `<li><a href="ch1.xhtml">Alice's Adventures in Wonderland</a></li>` +
      `<li><a href="ch1.xhtml">CONTENTS</a></li>` +
      `<li><a href="ch1.xhtml">Table of Contents</a></li>` +
      `<li><a href="ch1.xhtml">Project Gutenberg's Alice, by Lewis Carroll</a></li>` +
      `<li><a href="ch1.xhtml">Chapter I. Down the Rabbit-Hole</a></li>` +
      `</ol></nav></body></html>`;
    const book = parseEpub(
      epub3(opf, {
        "OEBPS/nav.xhtml": strToU8(nav),
        "OEBPS/ch1.xhtml": strToU8(chapterDoc("x")),
        "OEBPS/ch2.xhtml": strToU8(chapterDoc("x")),
        "OEBPS/ch3.xhtml": strToU8(chapterDoc("x")),
        "OEBPS/cover.png": PNG_1X1,
      }),
    );
    expect(book.chapters).toEqual(["Chapter I. Down the Rabbit-Hole"]);
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
      "OEBPS/ch1.xhtml": strToU8(chapterDoc("x")),
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
        "OEBPS/ch1.xhtml": strToU8(chapterDoc("x")),
      });
    expect(codeOf(() => parseEpub(enc(aes)))).toBe("drm");
    expect(parseEpub(enc(fonts)).chapters).toHaveLength(3);
  });

  it("counts long books fully instead of rejecting them", () => {
    const big = epub3(OPF3, {
      "OEBPS/nav.xhtml": strToU8(NAV),
      "OEBPS/ch1.xhtml": strToU8(chapterDoc(`${"word ".repeat(60_000)}`)),
      "OEBPS/ch2.xhtml": strToU8(chapterDoc("x")),
      "OEBPS/ch3.xhtml": strToU8(chapterDoc("x")),
    });
    expect(parseEpub(big).words).toBe(60_002);
  });

  it("reports broken files as unreadable", () => {
    const broken = epub3("this is not < xml", {
      "OEBPS/nav.xhtml": strToU8(NAV),
      "OEBPS/ch1.xhtml": strToU8(chapterDoc("x")),
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
