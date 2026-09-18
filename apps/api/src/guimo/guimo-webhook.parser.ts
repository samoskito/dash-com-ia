export type GuimoStage = { id: string; name: string };
export type GuimoStageMovement = {
  negotiationId: string;
  contactId: string;
  previousStage: GuimoStage | null;
  newStage: GuimoStage;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const id = (value: unknown): string | null =>
  typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value)
      : null;

function stage(value: unknown): GuimoStage | null {
  const candidate = record(value);
  const stageId = id(candidate?.id);
  const name = typeof candidate?.nome === "string" ? candidate.nome.trim() : "";
  return stageId && name ? { id: stageId, name } : null;
}

/** Observed Guimo payload v1 only. Unknown fields are discarded at the edge. */
export function parseGuimoV1StageMovement(value: unknown): GuimoStageMovement | null {
  const root = record(value);
  const negotiationId = id(root?.id_negociacao);
  const contactId = id(root?.id_contato);
  const newStage = stage(root?.estagio_novo);
  if (!negotiationId || !contactId || !newStage) return null;
  return { negotiationId, contactId, newStage, previousStage: stage(root?.estagio_anterior) };
}

export function normalizeGuimoStageName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function matchesGuimoStage(
  target: { id?: string | null; name?: string | null },
  received: GuimoStage,
  previous: GuimoStage | null,
): boolean {
  const matches = target.id?.trim()
    ? target.id.trim() === received.id
    : Boolean(target.name?.trim()) && normalizeGuimoStageName(target.name!) === normalizeGuimoStageName(received.name);
  const previousIsTarget = target.id?.trim()
    ? previous?.id === target.id.trim()
    : Boolean(target.name?.trim()) && previous != null && normalizeGuimoStageName(target.name!) === normalizeGuimoStageName(previous.name);
  return matches && !previousIsTarget;
}
