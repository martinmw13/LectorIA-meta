"use client";

import { useRef, useState } from "react";
import { ChatPanel } from "./chat-panel";
import { CHAT_COPY, CHAT_LABEL } from "./copy";
import { questionsForChapter, SUGGESTION_FILE, type SuggestionFile } from "./suggestions";
import { useChat } from "./use-chat";
import { ChatBubble } from "./chat-bubble";

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
        <ChatBubble open={open} />
      </button>
    </div>
  );
}
