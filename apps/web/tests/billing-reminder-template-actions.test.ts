import { afterEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, serverApiFetch } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  serverApiFetch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("../src/lib/server-api", () => ({ serverApiFetch }));

import { saveTrialReminderTemplatesAction } from "../src/app/(backoffice)/backoffice/billing/actions";
import { parseTrialReminderTemplates } from "../src/app/(backoffice)/backoffice/billing/reminder-templates";
import { initialBackofficeActionState } from "../src/components/backoffice-action-form";

afterEach(() => {
  revalidatePath.mockReset();
  serverApiFetch.mockReset();
});

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const filled: Record<string, string> = {
    d3_subject: "Seu teste termina em {{data_fim}}",
    d3_body: "Ola, {{cliente}}! Assine em {{link_assinatura}}",
    day_of_subject: "Hoje termina o teste",
    day_of_body: "Ola, {{cliente}}! Hoje e o ultimo dia.",
    post_subject: "Seu acesso esta no periodo de graca",
    post_body: "Ola, {{cliente}}! Regularize em {{link_assinatura}}",
    ...overrides,
  };

  for (const [key, value] of Object.entries(filled)) {
    data.set(key, value);
  }

  return data;
}

describe("save trial reminder templates action", () => {
  it("puts the three moments in one payload and refreshes the page", async () => {
    serverApiFetch.mockResolvedValueOnce([]);

    const result = await saveTrialReminderTemplatesAction(
      initialBackofficeActionState,
      form(),
    );

    expect(serverApiFetch).toHaveBeenCalledWith(
      "/backoffice/billing/trial-reminder-templates",
      {
        method: "PUT",
        body: JSON.stringify({
          templates: [
            {
              moment: "d3",
              body: "Ola, {{cliente}}! Assine em {{link_assinatura}}",
              emailSubject: "Seu teste termina em {{data_fim}}",
            },
            {
              moment: "day_of",
              body: "Ola, {{cliente}}! Hoje e o ultimo dia.",
              emailSubject: "Hoje termina o teste",
            },
            {
              moment: "post",
              body: "Ola, {{cliente}}! Regularize em {{link_assinatura}}",
              emailSubject: "Seu acesso esta no periodo de graca",
            },
          ],
        }),
      },
    );
    expect(result.status).toBe("success");
    expect(revalidatePath).toHaveBeenCalledWith("/backoffice/billing");
  });

  it("keeps the saved text when the API refuses the change", async () => {
    serverApiFetch.mockRejectedValueOnce(
      new Error("Templates de lembrete invalidos"),
    );

    const result = await saveTrialReminderTemplatesAction(
      initialBackofficeActionState,
      form(),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Templates de lembrete invalidos");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an unknown placeholder before calling the API", async () => {
    const result = await saveTrialReminderTemplatesAction(
      initialBackofficeActionState,
      form({ post_body: "Ola, {{primeiro_nome}}!" }),
    );

    expect(serverApiFetch).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toContain("{{primeiro_nome}}");
  });
});

describe("parse trial reminder templates", () => {
  it("trims every field and keeps the API order of moments", () => {
    const parsed = parseTrialReminderTemplates(
      form({ d3_body: "  Ola, {{cliente}}!  " }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.templates.map((entry) => entry.moment)).toEqual([
      "d3",
      "day_of",
      "post",
    ]);
    expect(parsed.templates[0].body).toBe("Ola, {{cliente}}!");
  });

  it.each([
    ["d3_body", "3 dias antes do fim"],
    ["day_of_subject", "No dia em que termina"],
    ["post_body", "Depois que terminou"],
  ])("names the moment when %s is empty", (field, title) => {
    const parsed = parseTrialReminderTemplates(form({ [field]: "   " }));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain(title);
  });

  it("refuses an email subject broken across lines", () => {
    const parsed = parseTrialReminderTemplates(
      form({ d3_subject: "Seu teste\ntermina hoje" }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain("uma linha");
  });

  it("refuses a body longer than the API accepts", () => {
    const parsed = parseTrialReminderTemplates(
      form({ post_body: "a".repeat(10_001) }),
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.message).toContain("10000");
  });

  it("accepts every placeholder the API supports", () => {
    const parsed = parseTrialReminderTemplates(
      form({
        d3_body:
          "{{cliente}} {{data_fim}} {{valor}} {{numeros}} {{link_assinatura}}",
      }),
    );

    expect(parsed.ok).toBe(true);
  });
});
