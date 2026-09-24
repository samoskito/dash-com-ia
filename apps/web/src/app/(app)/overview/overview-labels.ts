import type { WhatsappInstanceSummaryDto } from "@wpptrack/shared";

/** Name plus the masked phone suffix, shared by the filter bar and notes. */
export function instanceLabel(instance: WhatsappInstanceSummaryDto): string {
  const phoneOrProviderId = instance.providerInstanceId?.trim();

  if (!phoneOrProviderId) {
    return instance.name;
  }

  return `${instance.name} - ${maskInstanceIdentifier(phoneOrProviderId)}`;
}

function maskInstanceIdentifier(identifier: string): string {
  const visibleSuffix = identifier.slice(-4);

  return identifier.length <= 4 ? visibleSuffix : `•••• ${visibleSuffix}`;
}
