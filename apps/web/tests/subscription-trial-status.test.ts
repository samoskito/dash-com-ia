import { describe, expect, it } from "vitest";
import {
  subscriptionTrialNotice,
  trialStatusChipLabel,
} from "../src/app/(app)/subscription/trial-status";

const NOW = new Date("2026-09-18T12:00:00.000Z");

function contract(overrides: Record<string, unknown> = {}) {
  return {
    status: "exempt" as const,
    isCurrent: true,
    trialEndsAt: "2026-10-18T12:00:00.000Z",
    trialDaysRemaining: 30,
    canAutoconvert: true,
    graceEndsAt: null,
    accessEndsAt: "2026-10-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("trialStatusChipLabel", () => {
  it("names the running trial instead of showing 'Isento'", () => {
    expect(trialStatusChipLabel(contract(), NOW)).toBe("Trial ativo");
  });

  it("stays out of the way for contracts that are not a running trial", () => {
    expect(trialStatusChipLabel(contract({ trialEndsAt: null }), NOW)).toBeNull();
    expect(trialStatusChipLabel(contract({ status: "active" }), NOW)).toBeNull();
    expect(
      trialStatusChipLabel(
        contract({ trialEndsAt: "2026-09-10T12:00:00.000Z" }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("subscriptionTrialNotice", () => {
  it("shows the trial deadline and what happens at the end", () => {
    const notice = subscriptionTrialNotice(
      contract({ trialDaysRemaining: 12 }),
      NOW,
    );

    expect(notice?.tone).toBe("info");
    expect(notice?.title).toBe("Trial ate 18/10/2026");
    expect(notice?.description).toContain("12 dia(s)");
    expect(notice?.description).toContain("numeros conectados");
  });

  it("says nothing will be charged when the auto-cobranca is off", () => {
    const notice = subscriptionTrialNotice(
      contract({ canAutoconvert: false }),
      NOW,
    );

    expect(notice?.description).toContain("Nada sera cobrado");
  });

  it("keeps the access deadline visible while the trial is in grace", () => {
    const notice = subscriptionTrialNotice(
      contract({
        status: "grace_period",
        trialEndsAt: "2026-09-16T12:00:00.000Z",
        trialDaysRemaining: 0,
        graceEndsAt: "2026-09-19T12:00:00.000Z",
        accessEndsAt: "2026-09-19T12:00:00.000Z",
      }),
      NOW,
    );

    expect(notice).toEqual({
      tone: "warn",
      title: "Trial encerrado",
      description:
        "Seu acesso continua ate 19/09/2026. Conclua o pagamento para manter os numeros conectados.",
    });
  });

  it("explains that access continues while a pending plan waits for payment", () => {
    const notice = subscriptionTrialNotice(
      contract({
        status: "draft",
        isCurrent: false,
        trialEndsAt: null,
        trialDaysRemaining: null,
        canAutoconvert: false,
        accessEndsAt: null,
      }),
      NOW,
    );

    expect(notice?.tone).toBe("warn");
    expect(notice?.title).toBe("Pagamento pendente");
    expect(notice?.description).toContain("acesso atual continua");
  });

  it("has nothing to say about an ordinary paid contract", () => {
    expect(
      subscriptionTrialNotice(
        contract({
          status: "active",
          trialEndsAt: null,
          trialDaysRemaining: null,
          canAutoconvert: false,
        }),
        NOW,
      ),
    ).toBeNull();
    expect(subscriptionTrialNotice(null, NOW)).toBeNull();
  });
});
