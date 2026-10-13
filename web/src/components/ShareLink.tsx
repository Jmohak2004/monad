"use client";

import { useState } from "react";

export function ShareLink({ link, amountLabel }: { link: string; amountLabel: string }) {
  const [copied, setCopied] = useState(false);
  const message = `I sent you ${amountLabel} with Ghar. Tap to receive it: ${link}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="flex flex-col gap-3">
      <a
        className="btn btn-primary w-full"
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
      >
        Send on WhatsApp
      </a>
      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn btn-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={!canShare}
          onClick={() => navigator.share({ title: "Money for you", text: message }).catch(() => {})}
        >
          More…
        </button>
      </div>
      <p className="bg-warn-soft p-3 text-xs text-warn">
        Anyone who has this link can receive the money, so only send it to the person it&apos;s for. If nobody
        claims it within 7 days, you can take it back.
      </p>
    </div>
  );
}
