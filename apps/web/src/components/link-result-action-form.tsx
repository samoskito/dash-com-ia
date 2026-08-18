"use client";

import { type ReactNode, useState } from "react";
import {
  BackofficeActionForm,
  type BackofficeActionState,
  type BackofficeFormAction,
} from "./backoffice-action-form";
import { CopyLinkButton } from "./copy-link-button";

/**
 * Wraps BackofficeActionForm for actions whose success state carries a
 * one-time link (activation link, invite accept link) that should be shown
 * with a copy button right after submit.
 */
export function LinkResultActionForm({
  action,
  linkField,
  className,
  resetOnSuccess = false,
  children,
}: {
  action: BackofficeFormAction;
  linkField: "activationUrl" | "acceptUrl";
  className?: string;
  resetOnSuccess?: boolean;
  children: ReactNode;
}) {
  const [link, setLink] = useState<string | null>(null);

  function handleSuccess(state: BackofficeActionState) {
    setLink(state[linkField] ?? null);
  }

  return (
    <div className="link-result-action">
      <BackofficeActionForm
        action={action}
        className={className}
        onSuccess={handleSuccess}
        resetOnSuccess={resetOnSuccess}
      >
        {children}
      </BackofficeActionForm>
      {link ? (
        <div className="link-result-box">
          <input
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={link}
          />
          <CopyLinkButton url={link} />
        </div>
      ) : null}
    </div>
  );
}
