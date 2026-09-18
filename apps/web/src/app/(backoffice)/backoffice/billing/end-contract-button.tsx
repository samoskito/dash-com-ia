"use client";

import { useState } from "react";
import {
  BackofficeActionForm,
  type BackofficeFormAction,
} from "../../../../components/backoffice-action-form";
import { PendingSubmitButton } from "../../../../components/pending-submit-button";
import { DEFAULT_END_CONTRACT_REASON } from "./end-contract-eligibility";

export function EndContractButton({
  workspaceId,
  subscriptionId,
  planName,
  action,
}: {
  workspaceId: string;
  subscriptionId: string;
  planName: string;
  action: BackofficeFormAction;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        className="button danger compact-button"
        onClick={() => setConfirming(true)}
      >
        Encerrar
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
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <p role="alert">
        Encerrar <strong>{planName}</strong>? Ele sai desta lista.
      </p>
      <label>
        Motivo
        <input
          name="reason"
          defaultValue={DEFAULT_END_CONTRACT_REASON}
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
          pendingLabel="Encerrando..."
          className="button danger compact-button"
        />
      </div>
    </BackofficeActionForm>
  );
}
