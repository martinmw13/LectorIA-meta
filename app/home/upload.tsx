"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EPUB_ERROR_MESSAGES, EpubError, readEpubFile, type EpubBook } from "@/core/epub";
import { approxPages, FREE_BOOK_MAX_WORDS, uploadRoute } from "@/core/upload-policy";
import { BookCard } from "./book-card";
import { ByokStep } from "./byok";
import { getFreeBookUsed, setFreeBookUsed } from "./free-book";

type Status =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "error"; message: string }
  | { step: "parsed"; book: EpubBook }
  | { step: "processing"; book: EpubBook };

// Client-side only: files are parsed in the browser and never uploaded.
export function UploadSection() {
  const [status, setStatus] = useState<Status>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const [freeUsed, setFreeUsed] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const freePages = approxPages(FREE_BOOK_MAX_WORDS);

  useEffect(() => setFreeUsed(getFreeBookUsed()), []);

  // The parsed and processing views replace the drop zone, so move focus
  // into the result; otherwise keyboard focus is lost when it unmounts.
  useEffect(() => {
    if (status.step === "parsed" || status.step === "processing") resultRef.current?.focus();
  }, [status]);

  const book = status.step === "parsed" || status.step === "processing" ? status.book : null;
  useEffect(() => {
    if (!book?.cover) {
      setCoverUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([book.cover.bytes as BlobPart], { type: book.cover.mediaType }));
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [book]);

  async function openFile(file: File) {
    setStatus({ step: "reading" });
    try {
      setStatus({ step: "parsed", book: await readEpubFile(file) });
    } catch (err) {
      const message =
        err instanceof EpubError ? EPUB_ERROR_MESSAGES[err.code] : EPUB_ERROR_MESSAGES.unreadable;
      setStatus({ step: "error", message });
    }
  }

  function reset() {
    if (inputRef.current) inputRef.current.value = "";
    setStatus({ step: "idle" });
  }

  const route = status.step === "parsed" ? uploadRoute(status.book.words, freeUsed) : null;

  return (
    <section className="home-section" aria-label="Bring your own book">
      <h2 className="home-section-title">Bring your own book</h2>
      {status.step === "processing" ? (
        <div ref={resultRef} tabIndex={-1}>
          <p className="home-muted">
            Soundtracks for your own books are coming soon. For now, Oz shows how it works.
          </p>
          <div className="home-actions">
            <Link className="home-button" href="/read/oz">
              Read Oz instead
            </Link>
            <button className="home-text-button" type="button" onClick={reset}>
              Choose another book
            </button>
          </div>
        </div>
      ) : status.step === "parsed" && route ? (
        <div ref={resultRef} tabIndex={-1}>
          <BookCard book={status.book} coverUrl={coverUrl} />
          {route.kind === "free" ? (
            <div className="home-actions">
              <button
                className="home-button"
                type="button"
                onClick={() => {
                  setFreeBookUsed();
                  setFreeUsed(true);
                  setStatus({ step: "processing", book: status.book });
                }}
              >
                Read with soundtrack
              </button>
              <button className="home-text-button" type="button" onClick={reset}>
                Choose another book
              </button>
            </div>
          ) : (
            <div className="home-byok">
              <ByokStep
                reason={route.reason}
                onSubmit={() => setStatus({ step: "processing", book: status.book })}
              />
              <div className="home-actions">
                <button className="home-text-button" type="button" onClick={reset}>
                  Choose another book
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div
            className={dragging ? "home-drop home-drop-over" : "home-drop"}
            role="button"
            tabIndex={0}
            aria-label="Drop an EPUB here, or choose a file"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void openFile(file);
            }}
          >
            <p className="home-drop-label">
              Drop an EPUB here, or <span className="home-drop-choose">choose a file</span>
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".epub,application/epub+zip"
              hidden
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void openFile(file);
              }}
            />
          </div>
          <div aria-live="polite">
            {status.step === "reading" && <p className="home-muted">Opening your book…</p>}
            {status.step === "error" && (
              <div>
                <p className="home-muted">{status.message}</p>
                <button className="home-text-button" type="button" onClick={reset}>
                  Try another file
                </button>
              </div>
            )}
          </div>
          <div className="home-fineprint">
            <p className="home-muted">
              Your first book is on us, up to about {freePages} pages. Longer books or more of them?
              Bring your own key.
            </p>
            <p className="home-muted">
              EPUB only, up to 20 MB. Nothing leaves your computer until you choose to read it.
            </p>
            <p className="home-muted">
              Want more? Find free classics at{" "}
              <a href="https://www.gutenberg.org/" target="_blank" rel="noopener noreferrer">
                Project Gutenberg ↗
              </a>{" "}
              and{" "}
              <a href="https://standardebooks.org/" target="_blank" rel="noopener noreferrer">
                Standard Ebooks ↗
              </a>
              , then bring them here.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
