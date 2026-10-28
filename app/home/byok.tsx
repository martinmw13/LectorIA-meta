import { useId, useState } from "react";
import { approxPages, FREE_BOOK_MAX_WORDS } from "@/core/upload-policy";

type Provider = "meta" | "openai";

const REASONS: Record<"too_long" | "free_used", (pages: number) => string> = {
  too_long: (pages) => `This one is longer than about ${pages} pages, so it needs your own key.`,
  free_used: () => "You've already used your free book, so this one needs your own key.",
};

// Key step only: no network call. The key lives in state and is cleared
// on submit, on reset, and on unmount; never stored, logged, or shared.
export function ByokStep({
  reason,
  onSubmit,
}: {
  reason: "too_long" | "free_used";
  onSubmit: () => void;
}) {
  const [provider, setProvider] = useState<Provider>("meta");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const privacyId = useId();
  const urlId = useId();
  const urlErrorId = useId();
  const freePages = approxPages(FREE_BOOK_MAX_WORDS);

  const urlOk = baseUrl.trim() === "" || /^https:\/\//.test(baseUrl.trim());
  const ready =
    key.trim() !== "" && (provider === "meta" || (urlOk && baseUrl.trim() !== "" && model.trim() !== ""));

  return (
    <div>
      <h3 className="home-section-title">Bring your own key to read this book with its soundtrack</h3>
      <p className="home-muted">{REASONS[reason](freePages)}</p>
      <div className="home-radio-row" role="radiogroup" aria-label="Key provider">
        <label className="home-radio">
          <input
            type="radio"
            name="byok-provider"
            checked={provider === "meta"}
            onChange={() => setProvider("meta")}
          />
          Meta <span className="home-tag">Recommended</span>
        </label>
        <label className="home-radio">
          <input
            type="radio"
            name="byok-provider"
            checked={provider === "openai"}
            onChange={() => setProvider("openai")}
          />
          OpenAI-compatible
        </label>
      </div>
      {provider === "openai" && (
        <>
          <label className="home-field" htmlFor={urlId}>
            Base URL
            <input
              id={urlId}
              className="home-input"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://"
              aria-invalid={!urlOk}
              aria-describedby={urlOk ? undefined : urlErrorId}
            />
          </label>
          {!urlOk && (
            <p className="home-error" id={urlErrorId}>
              The base URL needs to start with https://.
            </p>
          )}
          <label className="home-field">
            Model
            <input
              className="home-input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </label>
        </>
      )}
      <label className="home-field">
        Key
        <input
          className="home-input"
          type="password"
          name="transient-key"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          aria-describedby={privacyId}
        />
      </label>
      <p className="home-muted" id={privacyId}>
        Your key stays in this browser tab. It&apos;s never stored on our servers, and it&apos;s
        only used to process this book.
      </p>
      <div className="home-actions">
        <button
          className="home-button"
          type="button"
          disabled={!ready}
          onClick={() => {
            setKey("");
            onSubmit();
          }}
        >
          Read with soundtrack
        </button>
      </div>
    </div>
  );
}
