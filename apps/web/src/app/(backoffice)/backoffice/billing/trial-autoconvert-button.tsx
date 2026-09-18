"use client";

import { useState } from "react";
import {
  BackofficeActionForm,
  type BackofficeFormAction,
} from "../../../../components/backoffice-action-form";
import { PendingSubmitButton } from "../../../../components/pending-submit-button";
import { DEFAULT_DISABLE_AUTOCONVERT_REASON } from "./trial-eligibility";

export function TrialAutoconvertButton({
  workspaceId,
  workspaceName,
  action,
}: {
  workspaceId: string;
  workspaceName: string;
  action: BackofficeFormAction;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="button ghost compact-button"
        onClick={() => setConfirming(true)}
      >
        Desligar auto-cobranca
      </button>
    );
  }

  return (
    <BackofficeActionForm
      action={action}
      className="billing-end-contract-confirm"
      onSuccess={() => setConfirming(false)}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <p role="alert">
        Desligar a cobranca automatica de <strong>{workspaceName}</strong>? No
        fim do trial nada sera cobrado.
      </p>
      <label>
        Motivo
        <input
          name="reason"
          defaultValue={DEFAULT_DISABLE_AUTOCONVERT_REASON}
          minLength={3}
          required
          autoComplete="off"
        />
      </label>
      <div className="billing-end-contract-actions">
        <button
          type="button"
          className="button ghost compact-button"
          onClick={() => setConfirming(false)}
        >
          Manter
        </button>
        <PendingSubmitButton
          label="Confirmar"
          pendingLabel="Desligando..."
          className="button danger compact-button"
        />
      </div>
    </BackofficeActionForm>
  );
}
