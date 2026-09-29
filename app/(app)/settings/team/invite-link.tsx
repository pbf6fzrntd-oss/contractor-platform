"use client";

import { useState } from "react";

/** Shows an invite link with buttons to copy it or text it from the phone. */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const message = `Join our team on the app: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input readOnly value={url} className="input text-sm" aria-label="Invite link" onFocus={(e) => e.target.select()} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copy} className="btn-secondary">
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a href={`sms:?&body=${encodeURIComponent(message)}`} className="btn-secondary">
          Text it
        </a>
      </div>
    </div>
  );
}
