"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EPUB_ERROR_MESSAGES, EpubError, readEpubFile, type EpubBook } from "@/core/epub";
import { approxPages, FREE_BOOK_MAX_WORDS, uploadRoute } from "@/core/upload-policy";
import { BookCard } from "./book-card";
import { ByokStep } from "./byok";
import { getFreeBookUsed, setFreeBookUsed } from "./free-book";
import { HomeIcon } from "./home-icons";

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
  const [keyOpen, setKeyOpen] = useState(false);
  // Tab-only scratch: never stored, logged, or sent; dies with this component.
  const [idleKey, setIdleKey] = useState("");
  const [showKey, setShowKey] = useState(false);
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
    setIdleKey("");
    setShowKey(false);
    setStatus({ step: "idle" });
  }

  const route = status.step === "parsed" ? uploadRoute(status.book.words, freeUsed) : null;

  return (
    <section className="ob-bring" aria-label="Bring your own book">
      {status.step === "processing" ? (
        <div ref={resultRef} tabIndex={-1}>
          <p className="ob-note">
            Soundtracks for your own books are coming soon. For now, Oz shows how it works.
          </p>
          <div className="ob-actions">
            <Link className="ob-action" href="/read/oz">
              Read Oz instead
            </Link>
            <button className="ob-quiet" type="button" onClick={reset}>
              Choose another book
            </button>
          </div>
        </div>
      ) : status.step === "parsed" && route ? (
        <div ref={resultRef} tabIndex={-1}>
          <BookCard book={status.book} coverUrl={coverUrl} />
          {route.kind === "free" ? (
            <div className="ob-actions">
              <button
                className="ob-action"
                type="button"
                onClick={() => {
                  setFreeBookUsed();
                  setFreeUsed(true);
                  setStatus({ step: "processing", book: status.book });
                }}
              >
                Read with soundtrack
              </button>
              <button className="ob-quiet" type="button" onClick={reset}>
                Choose another book
              </button>
            </div>
          ) : (
            <div>
              <ByokStep
                reason={route.reason}
                initialKey={idleKey}
                onSubmit={() => {
                  setIdleKey("");
                  setShowKey(false);
                  setStatus({ step: "processing", book: status.book });
                }}
              />
              <div className="ob-actions">
                <button className="ob-quiet" type="button" onClick={reset}>
                  Choose another book
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div
            className={dragging ? "ob-drop over" : "ob-drop"}
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
            <HomeIcon name="upload" />
            <p>
              Drop an EPUB here, or <span className="ob-pick">choose a file</span>
            </p>
            <small>EPUB only, up to 20 MB. Nothing leaves your computer until you choose to read it.</small>
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
            {status.step === "reading" && <p className="ob-file">Opening your book…</p>}
            {status.step === "error" && (
              <div className="ob-file-row">
                <p className="ob-file ob-err">{status.message}</p>
                <button className="ob-quiet" type="button" onClick={reset}>
                  Try another file
                </button>
              </div>
            )}
          </div>
          <div className="ob-picks" role="group" aria-label="How much reading to take">
            <button
              type="button"
              className="ob-pickbtn"
              aria-pressed={!keyOpen}
              onClick={() => {
                setKeyOpen(false);
                setIdleKey("");
                setShowKey(false);
              }}
            >
              <span className="ob-box" aria-hidden="true">
                <HomeIcon name="check-box" />
              </span>
              <span>
                <b>Free</b>
                <small>Your first book is on us, up to about {freePages} pages.</small>
              </span>
            </button>
            <button
              type="button"
              className="ob-pickbtn"
              aria-pressed={keyOpen}
              aria-expanded={keyOpen}
              aria-controls="obKeybox"
              onClick={() => {
                if (keyOpen) {
                  setIdleKey("");
                  setShowKey(false);
                }
                setKeyOpen(!keyOpen);
              }}
            >
              <span className="ob-keydoodle" aria-hidden="true">
                <HomeIcon name="key" />
              </span>
              <span>
                <b>Bring your own key!</b>
                <small>Longer books, or more of them? Use your own Meta key.</small>
              </span>
            </button>
          </div>
          <div className="ob-keybox" id="obKeybox" hidden={!keyOpen}>
            <p className="ob-fine">
              After your book opens, longer ones ask for your own Meta key. It stays in this tab only.
            </p>
            <div className="ob-keyrow">
              <label className="sr-only" htmlFor="obKey">
                Paste your API key
              </label>
              <input
                id="obKey"
                type={showKey ? "text" : "password"}
                placeholder="Paste your API key"
                autoComplete="off"
                spellCheck={false}
                name="transient-key"
                value={idleKey}
                onChange={(event) => setIdleKey(event.target.value)}
              />
              <button
                type="button"
                className="ob-eye"
                aria-label={showKey ? "Hide API key" : "Show API key"}
                aria-pressed={showKey}
                onClick={() => setShowKey((show) => !show)}
              >
                <HomeIcon name={showKey ? "eye-off" : "eye"} />
              </button>
            </div>
            <p className="ob-fine">It stays in this tab only. We never save it.</p>
          </div>
        </div>
      )}
    </section>
  );
}
