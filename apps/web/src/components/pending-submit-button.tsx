"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  label,
  pendingLabel,
  className = "button"
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
