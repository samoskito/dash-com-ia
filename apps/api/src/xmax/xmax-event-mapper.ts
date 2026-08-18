import { extractXmaxTagIds } from "./xmax-contact.parser";

export type XmaxMappedEventName = "QualifiedLead" | "Purchase";

export type XmaxTagMapping = {
  qualifiedLeadTagIds: string[];
  purchaseTagIds: string[];
};

/**
 * Map XMAX contact tags to platform events.
 * Priority: Purchase > QualifiedLead (if both 56 and 55 present → only Purchase).
 * Unknown / empty tags → null (discard).
 */
export function mapXmaxTagsToEvent(
  tagIds: string[] | unknown,
  mapping: XmaxTagMapping,
): XmaxMappedEventName | null {
  const ids = Array.isArray(tagIds)
    ? tagIds.map(String)
    : extractXmaxTagIds(tagIds);
  if (ids.length === 0) {
    return null;
  }

  const purchase = new Set(mapping.purchaseTagIds.map(String));
  const qualified = new Set(mapping.qualifiedLeadTagIds.map(String));

  let hasPurchase = false;
  let hasQualified = false;
  for (const id of ids) {
    if (purchase.has(id)) hasPurchase = true;
    if (qualified.has(id)) hasQualified = true;
  }

  if (hasPurchase) {
    return "Purchase";
  }
  if (hasQualified) {
    return "QualifiedLead";
  }
  return null;
}
