"use client";

import { useState } from "react";

export function CopyLinkButton({
  url,
  label = "Copiar link",
  copiedLabel = "Copiado!",
  className = "button ghost compact-button",
}: {
  url: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className={className} onClick={handleCopy} type="button">
      {copied ? copiedLabel : label}
    </button>
  );
}
