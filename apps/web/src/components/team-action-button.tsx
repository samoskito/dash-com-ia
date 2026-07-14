"use client";

import {
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useFormStatus } from "react-dom";

const icons = {
  remove: Trash2,
  resend: RefreshCw,
  revoke: X,
  save: Save,
  shield: ShieldCheck
} as const;

export function TeamActionButton({
  confirmMessage,
  danger = false,
  kind,
  label
}: {
  confirmMessage?: string;
  danger?: boolean;
  kind: keyof typeof icons;
  label: string;
}) {
  const { pending } = useFormStatus();
  const Icon = icons[kind];

  return (
    <button
      aria-label={label}
      className={`team-icon-button${danger ? " danger" : ""}`}
      disabled={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      title={pending ? "Processando" : label}
      type="submit"
    >
      <Icon aria-hidden="true" size={15} strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
