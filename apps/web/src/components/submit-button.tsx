"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingLabel: string;
  statusText?: string;
};

export function SubmitButton({
  children,
  pendingLabel,
  statusText,
  className = "button",
  disabled,
  type = "submit",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled || pending);

  return (
    <>
      <button
        {...props}
        aria-busy={pending}
        className={className}
        data-pending={pending ? "true" : undefined}
        disabled={isDisabled}
        type={type}
      >
        {pending ? pendingLabel : children}
      </button>
      {statusText ? (
        <span className="form-status" role="status" aria-live="polite">
          {pending ? statusText : ""}
        </span>
      ) : null}
    </>
  );
}
