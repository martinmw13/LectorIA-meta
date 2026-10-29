"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove?: (id: string) => void;
    };
    onChatTurnstileReady?: () => void;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof document === "undefined") return Promise.reject(new Error("no dom"));
  const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
  if (existing && window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = SCRIPT_SRC;
      tag.async = true;
      tag.defer = true;
      tag.onload = () => resolve();
      tag.onerror = () => {
        scriptPromise = null;
        reject(new Error("turnstile failed"));
      };
      document.head.appendChild(tag);
    });
  }
  return scriptPromise;
}

// Renders nothing when no site key is configured, and then no token is sent.
// Otherwise renders the interactive check once and reports its token.
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !boxRef.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(boxRef.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: (token: string) => cbRef.current(token),
        });
      })
      .catch(() => {
        // Check unavailable: the chat still sends without a token.
      });
    return () => {
      cancelled = true;
      try {
        if (widgetId && window.turnstile?.remove) window.turnstile.remove(widgetId);
      } catch {
        // Widget already gone with the panel.
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={boxRef} className="chat-turnstile" />;
}
