/**
 * Trial reminder templates are edited as one block: the API replaces the three
 * moments at once, so the form posts every field and this module turns the raw
 * FormData into the payload — applying the same limits the API enforces, in
 * plain Portuguese, before any request leaves the backoffice.
 */

export type TrialReminderMoment = "d3" | "day_of" | "post";

export type TrialReminderTemplate = {
  moment: TrialReminderMoment;
  body: string;
  emailSubject: string;
};

export type TrialReminderMomentCopy = {
  moment: TrialReminderMoment;
  title: string;
  hint: string;
};

/** Order shown on the page, from the earliest reminder to the last one. */
export const TRIAL_REMINDER_MOMENTS: TrialReminderMomentCopy[] = [
  {
    moment: "d3",
    title: "3 dias antes do fim",
    hint: "Aviso de que o teste esta acabando e ainda da tempo de assinar.",
  },
  {
    moment: "day_of",
    title: "No dia em que termina",
    hint: "Ultimo lembrete enviado no dia do encerramento do teste.",
  },
  {
    moment: "post",
    title: "Depois que terminou",
    hint: "Cobranca gentil enquanto o cliente ainda esta no periodo de graca.",
  },
];

/** The only variables the API replaces when it sends the message. */
export const TRIAL_REMINDER_PLACEHOLDERS = [
  { token: "{{cliente}}", description: "nome do cliente" },
  { token: "{{data_fim}}", description: "data em que o teste termina" },
  { token: "{{valor}}", description: "valor mensal da assinatura" },
  { token: "{{numeros}}", description: "quantidade de numeros liberados" },
  { token: "{{link_assinatura}}", description: "link para assinar" },
] as const;

const SUPPORTED_TOKENS = new Set(
  TRIAL_REMINDER_PLACEHOLDERS.map((placeholder) =>
    placeholder.token.slice(2, -2),
  ),
);

const MAX_BODY_LENGTH = 10_000;
const MAX_SUBJECT_LENGTH = 300;

export type TrialReminderParseResult =
  | { ok: true; templates: TrialReminderTemplate[] }
  | { ok: false; message: string };

/** Field names the form uses for a moment, kept in one place. */
export function reminderFieldName(
  moment: TrialReminderMoment,
  field: "body" | "subject",
): string {
  return `${moment}_${field}`;
}

export function parseTrialReminderTemplates(
  formData: Pick<FormData, "get">,
): TrialReminderParseResult {
  const templates: TrialReminderTemplate[] = [];

  for (const { moment, title } of TRIAL_REMINDER_MOMENTS) {
    const body = String(
      formData.get(reminderFieldName(moment, "body")) ?? "",
    ).trim();
    const emailSubject = String(
      formData.get(reminderFieldName(moment, "subject")) ?? "",
    ).trim();

    if (!body || !emailSubject) {
      return {
        ok: false,
        message: `Preencha o assunto e a mensagem de "${title}".`,
      };
    }

    if (body.length > MAX_BODY_LENGTH) {
      return {
        ok: false,
        message: `A mensagem de "${title}" passou de ${MAX_BODY_LENGTH} caracteres.`,
      };
    }

    if (emailSubject.length > MAX_SUBJECT_LENGTH) {
      return {
        ok: false,
        message: `O assunto de "${title}" passou de ${MAX_SUBJECT_LENGTH} caracteres.`,
      };
    }

    if (/[\r\n]/.test(emailSubject)) {
      return {
        ok: false,
        message: `O assunto de "${title}" precisa caber em uma linha so.`,
      };
    }

    const unsupported = findUnsupportedPlaceholder(`${body}\n${emailSubject}`);

    if (unsupported) {
      return {
        ok: false,
        message: `"${title}" usa {{${unsupported}}}, que nao existe. Use apenas os atalhos listados.`,
      };
    }

    templates.push({ moment, body, emailSubject });
  }

  return { ok: true, templates };
}

function findUnsupportedPlaceholder(text: string): string | null {
  for (const match of text.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
    if (!SUPPORTED_TOKENS.has(match[1])) {
      return match[1];
    }
  }

  return null;
}
