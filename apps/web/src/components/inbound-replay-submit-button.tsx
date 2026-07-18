"use client";

import { PlayCircle, ShieldCheck } from "lucide-react";
import { useFormStatus } from "react-dom";

export function InboundReplaySubmitButton({
  mode,
}: {
  mode: "certify" | "replay";
}) {
  const { pending } = useFormStatus();
  const Icon = mode === "certify" ? ShieldCheck : PlayCircle;
  const label =
    mode === "certify"
      ? pending
        ? "Certificando..."
        : "Certificar parser"
      : pending
        ? "Autorizando..."
        : "Autorizar replay";

  return (
    <button className="button" type="submit" disabled={pending}>
      <Icon aria-hidden="true" size={17} strokeWidth={2} />
      {label}
    </button>
  );
}
