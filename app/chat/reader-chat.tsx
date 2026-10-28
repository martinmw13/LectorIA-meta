"use client";

import { useRef, useState } from "react";
import { ChatPanel } from "./chat-panel";
import { CHAT_COPY, CHAT_LABEL } from "./copy";
import { questionsForChapter, SUGGESTION_FILE, type SuggestionFile } from "./suggestions";
import { useChat } from "./use-chat";

// Launcher + panel shell. Mounted once inside the reader folio; the key it
// holds lives in state only, so reload and panel close clear it.
export function ReaderChat({
  bookId,
  upToN,
  chapter,
  chapterTitle,
  suggestionFile,
}: {
  bookId: "oz";
  upToN: number;
  chapter: number;
  chapterTitle: string;
  suggestionFile?: SuggestionFile | null;
}) {
  const [open, setOpen] = useState(false);
  const [byokKey, setByokKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const chat = useChat({
    bookId,
    upToN,
    byokKey,
    turnstileToken,
    onTokenUsed: () => setTurnstileToken(null),
  });

  function close() {
    setOpen(false);
    setByokKey(null); // Memory only: closing forgets the key.
    launcherRef.current?.focus();
  }

  const suggestions = questionsForChapter(chapter, suggestionFile ?? SUGGESTION_FILE);

  return (
    <div className="reader-chat">
      {open && (
        <ChatPanel
          chapter={chapter}
          chapterTitle={chapterTitle}
          chat={chat}
          suggestions={suggestions}
          byokKey={byokKey}
          onKeySubmit={(key) => {
            setByokKey(key);
            chat.retry({ key });
          }}
          onHumanToken={(token) => {
            chat.setNeedHuman(false);
            setTurnstileToken(token);
            chat.retry({ token });
          }}
          onClose={close}
        />
      )}
      <button
        ref={launcherRef}
        type="button"
        className="chat-launch"
        aria-expanded={open}
        aria-controls="chat-panel"
        aria-label={open ? CHAT_COPY.closeChat : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="chat-launch-label">{open ? CHAT_COPY.close : CHAT_LABEL}</span>
        <svg className="chat-bub" viewBox="0 0 46 42" aria-hidden="true">
          <path className="bub-body" d="M8 6h30a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H20l-9 7v-7H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" />
          <path className="bub-inner" d="M8 6h30a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H20l-9 7v-7H8a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" transform="translate(3.2 3) scale(.86)" />
          {open ? (
            <path className="bub-glyph" d="M16 17l7 6 7-6" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <g className="bub-glyph" fill="currentColor">
              <circle cx="15" cy="19" r="2.1" />
              <circle cx="23" cy="19" r="2.1" />
              <circle cx="31" cy="19" r="2.1" />
            </g>
          )}
        </svg>
      </button>
    </div>
  );
}
