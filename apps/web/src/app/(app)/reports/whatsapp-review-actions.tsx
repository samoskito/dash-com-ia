"use client";

import type { CampaignReportRowDto } from "@wpptrack/shared";
import { useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  BackofficeActionForm,
  type BackofficeActionState,
  type BackofficeFormAction,
} from "../../../components/backoffice-action-form";

type WhatsappClassification = NonNullable<
  CampaignReportRowDto["whatsappClassification"]
>;

const classificationLabels: Record<WhatsappClassification, string> = {
  auto_whatsapp: "WhatsApp automatico",
  creative_whatsapp: "WhatsApp pelo criativo",
  detected_by_leads: "WhatsApp pelos leads",
  manual_include: "Incluido manualmente",
  manual_exclude: "Excluido manualmente",
  needs_review: "Revisao necessaria",
  not_whatsapp: "Fora do WhatsApp",
};

function ReviewActionButton({
  active,
  disabled = false,
  label,
  value,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  value: "manual_include" | "manual_exclude" | "";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-pressed={value ? Boolean(active) : undefined}
      className={active ? "is-active" : undefined}
      disabled={disabled || pending}
      name="override"
      type="submit"
      value={value}
    >
      {label}
    </button>
  );
}

export function WhatsappReviewActions({
  action,
  classification,
  id,
  level,
}: {
  action: BackofficeFormAction;
  classification?: WhatsappClassification;
  id: string;
  level: "campaign" | "adset" | "ad";
}) {
  const [currentClassification, setCurrentClassification] =
    useState(classification);

  useEffect(() => {
    setCurrentClassification(classification);
  }, [classification]);

  const handleSuccess = useCallback((state: BackofficeActionState) => {
    if (state.whatsappClassification) {
      setCurrentClassification(state.whatsappClassification);
    }
  }, []);

  const isIncluded = currentClassification === "manual_include";
  const isExcluded = currentClassification === "manual_exclude";
  const hasManualOverride = isIncluded || isExcluded;
  const stateClass = isExcluded
    ? " excluded"
    : isIncluded
      ? " included"
      : "";

  return (
    <div
      className={`review-control${isExcluded ? " is-excluded" : ""}`}
    >
      <span
        aria-live="polite"
        className={`review-state${stateClass}`}
        role="status"
      >
        {currentClassification
          ? classificationLabels[currentClassification]
          : "Classificacao automatica"}
      </span>
      <BackofficeActionForm
        action={action}
        className="review-actions"
        onSuccess={handleSuccess}
      >
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="id" value={id} />
        <ReviewActionButton
          active={isIncluded}
          label="Incluir"
          value="manual_include"
        />
        <ReviewActionButton
          active={isExcluded}
          label="Excluir"
          value="manual_exclude"
        />
        <ReviewActionButton
          disabled={!hasManualOverride}
          label="Resetar"
          value=""
        />
      </BackofficeActionForm>
    </div>
  );
}
