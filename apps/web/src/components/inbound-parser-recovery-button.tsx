"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";

export function InboundParserRecoveryButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="button ghost compact-button inbound-replay-link"
      type="submit"
      disabled={pending}
      title="Reclassificar somente este payload com o parser atual"
    >
      <RefreshCw aria-hidden="true" size={16} strokeWidth={2} />
      {pending ? "Reprocessando..." : "Reprocessar parser"}
    </button>
  );
}
