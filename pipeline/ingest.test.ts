import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { runIngest } from "./ingest";
import type { BookConfig } from "./ingest";

const NS = 'xmlns="http://www.w3.org/1999/xhtml"';

function book(paragraphs: string[], linearNo = false): Uint8Array<ArrayBuffer> {
  const files: Record<string, string> = {
    "META-INF/container.xml":
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    "OEBPS/content.opf":
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tiny</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch" href="ch.xhtml" media-type="application/xhtml+xml"/></manifest>' +
      `<spine><itemref idref="ch"${linearNo ? ' linear="no"' : ""}/></spine></package>`,
    "OEBPS/nav.xhtml": `<html ${NS}><head><title>Nav</title></head><body><nav><a href="ch.xhtml">Chapter One</a></nav></body></html>`,
    "OEBPS/ch.xhtml": `<html ${NS}><head><title>Ch One</title></head><body><h1>CHAPTER I</h1>${paragraphs.map((p) => `<p>${p}</p>`).join("")}</body></html>`,
  };
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) encoded[name] = new TextEncoder().encode(text);
  return new Uint8Array(zipSync(encoded));
}

const CONFIG: BookConfig = { gutenberg: 55, title: "Tiny", author: "A Writer", format: "epub" };

function fetchEpub(bytes: Uint8Array<ArrayBuffer>) {
  return (async () => new Response(bytes, { status: 200 })) as typeof fetch;
}

describe("runIngest epub path", () => {
  it("creates the dir, writes book.json and clean-report.json", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "ingest-")), "nested", "testbook");
    const result = await runIngest({ bookKey: "testbook", force: false, dir }, { fetchFn: fetchEpub(book(["Story one."])), config: CONFIG });
    expect(result.chapters).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(dir, "book.json"), "utf8")).textVersion).toBe(result.textVersion);
    const report = JSON.parse(readFileSync(join(dir, "clean-report.json"), "utf8")) as { source: string };
    expect(report.source).toBe("epub");
  });

  it("throws when cleaning keeps zero chapters", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "ingest-")), "testbook");
    await expect(
      runIngest({ bookKey: "testbook", force: false, dir }, { fetchFn: fetchEpub(book(["Story one."], true)), config: CONFIG }),
    ).rejects.toThrow("no chapters found after cleaning");
  });

  it("leaves the old report alone when the drift check fails", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "ingest-")), "testbook");
    const ctx = { bookKey: "testbook", force: false, dir };
    await runIngest(ctx, { fetchFn: fetchEpub(book(["Story one."])), config: CONFIG });
    const reportBefore = readFileSync(join(dir, "clean-report.json"), "utf8");
    const bookBefore = readFileSync(join(dir, "book.json"), "utf8");
    await expect(
      runIngest(ctx, { fetchFn: fetchEpub(book(["A different story."])), config: CONFIG }),
    ).rejects.toThrow("textVersion drift");
    expect(readFileSync(join(dir, "clean-report.json"), "utf8")).toBe(reportBefore);
    expect(readFileSync(join(dir, "book.json"), "utf8")).toBe(bookBefore);
  });
});
