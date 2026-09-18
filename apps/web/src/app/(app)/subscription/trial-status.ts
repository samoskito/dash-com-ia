import type { WorkspaceSubscriptionContractStatus } from "@wpptrack/shared";

/**
 * `/billing/package/state` sends a single contract: the pending paid draft when
 * one exists, otherwise the live contract. Trial fields are optional here so an
 * older API response renders the page without any trial copy.
 */
export type TrialAwareClientContract = {
  status: WorkspaceSubscriptionContractStatus;
  isCurrent?: boolean;
  trialEndsAt?: string | null;
  trialDaysRemaining?: number | null;
  canAutoconvert?: boolean;
  graceEndsAt?: string | null;
  accessEndsAt?: string | null;
};

export type SubscriptionTrialNotice = {
  tone: "info" | "warn";
  title: string;
  description: string;
};

const DAY_IN_MS = 86_400_000;

function isRunningTrial(
  contract: TrialAwareClientContract,
  now: Date,
): boolean {
  return (
    contract.status === "exempt" &&
    Boolean(contract.trialEndsAt) &&
    new Date(String(contract.trialEndsAt)).getTime() > now.getTime()
  );
}

/** Replaces the raw "Isento" chip while the trial is running. */
export function trialStatusChipLabel(
  contract: TrialAwareClientContract | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!contract) {
    return null;
  }

  return isRunningTrial(contract, now) ? "Trial ativo" : null;
}

export function subscriptionTrialNotice(
  contract: TrialAwareClientContract | null | undefined,
  now: Date = new Date(),
): SubscriptionTrialNotice | null {
  if (!contract) {
    return null;
  }

  if (isRunningTrial(contract, now)) {
    return {
      tone: "info",
      title: `Trial ate ${dateLabel(contract.trialEndsAt)}`,
      description: `${remainingLabel(contract, now)} ${
        contract.canAutoconvert === true
          ? "Ao fim do periodo geramos a cobranca dos numeros conectados."
          : "Nada sera cobrado no fim do periodo."
      }`,
    };
  }

  if (contract.status === "exempt" && contract.trialEndsAt) {
    return {
      tone: "warn",
      title: "Trial encerrado",
      description: `O periodo de teste terminou em ${dateLabel(
        contract.trialEndsAt,
      )}.`,
    };
  }

  if (contract.status === "grace_period" && contract.trialEndsAt) {
    return {
      tone: "warn",
      title: "Trial encerrado",
      description: `Seu acesso continua ate ${dateLabel(
        contract.graceEndsAt ?? contract.accessEndsAt,
      )}. Conclua o pagamento para manter os numeros conectados.`,
    };
  }

  const isPendingDraft =
    contract.status === "draft" || contract.status === "awaiting_payment";

  if (isPendingDraft && contract.isCurrent === false) {
    return {
      tone: "warn",
      title: "Pagamento pendente",
      description:
        "Seu acesso atual continua ativo. Conclua o pagamento para manter os numeros conectados.",
    };
  }

  return null;
}

function remainingLabel(
  contract: TrialAwareClientContract,
  now: Date,
): string {
  const days =
    typeof contract.trialDaysRemaining === "number"
      ? Math.max(0, contract.trialDaysRemaining)
      : Math.max(
          0,
          Math.ceil(
            (new Date(String(contract.trialEndsAt)).getTime() - now.getTime()) /
              DAY_IN_MS,
          ),
        );

  return `Faltam ${days} dia(s).`;
}

function dateLabel(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "data indefinida";
}
