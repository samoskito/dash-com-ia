import { describe, expect, it, vi } from "vitest";
import { hashPhoneIdentity } from "../src/common/phone/phone-identity";
import { ProviderConversionPaidLeadResolver } from "../src/conversion-rules/provider-conversion-paid-lead-resolver.service";

function resolverWith(candidates: Array<Record<string, unknown>>) {
  const findMany = vi.fn(async () => candidates);
  const resolver = new ProviderConversionPaidLeadResolver({
    lead: { findMany },
  } as never);

  return { findMany, resolver };
}

describe("provider conversion paid-lead resolver", () => {
  it("returns missing_identity before querying Prisma", async () => {
    const harness = resolverWith([]);

    await expect(
      harness.resolver.resolve({
        workspaceId: "workspace_1",
        phone: "sem telefone",
      }),
    ).resolves.toEqual({
      status: "missing_identity",
      reasonCode: "missing_contact_identity",
    });
    expect(harness.findMany).not.toHaveBeenCalled();
  });

  it("returns not_found for a normalized phone outside the paid-lead base", async () => {
    const harness = resolverWith([]);

    await expect(
      harness.resolver.resolve({
        workspaceId: "workspace_1",
        phone: "+55 11 99999-9999",
      }),
    ).resolves.toEqual({
      status: "not_found",
      reasonCode: "paid_lead_not_found",
      candidateLeadId: null,
    });
    expect(harness.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          phoneHash: hashPhoneIdentity("+55 11 99999-9999"),
        },
        take: 2,
      }),
    );
  });

  it("returns ambiguous defensively when more than one paid lead is found", async () => {
    const harness = resolverWith([
      {
        id: "lead_1",
        phoneHash: "hash_1",
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adId: " ad_1 ",
        ctwaClid: " ctwa_1 ",
      },
      {
        id: "lead_2",
        phoneHash: "hash_1",
        adId: "ad_2",
        ctwaClid: "ctwa_2",
      },
    ]);

    await expect(
      harness.resolver.resolve({
        workspaceId: "workspace_1",
        phone: "+5511999999999",
      }),
    ).resolves.toEqual({
      status: "ambiguous",
      reasonCode: "paid_lead_ambiguous",
      candidateLeadIds: ["lead_1", "lead_2"],
    });
  });

  it("keeps a lead with incomplete paid attribution outside eligibility", async () => {
    const harness = resolverWith([
      {
        id: "lead_1",
        phoneHash: "hash_1",
        adId: null,
        ctwaClid: "ctwa_1",
      },
    ]);

    await expect(
      harness.resolver.resolve({
        workspaceId: "workspace_1",
        phone: "+5511999999999",
      }),
    ).resolves.toEqual({
      status: "not_found",
      reasonCode: "paid_attribution_missing",
      candidateLeadId: "lead_1",
    });
  });

  it("returns the paid attribution required by conversion materialization", async () => {
    const harness = resolverWith([
      {
        id: "lead_1",
        phoneHash: "hash_1",
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adId: " ad_1 ",
        ctwaClid: " ctwa_1 ",
      },
    ]);

    await expect(
      harness.resolver.resolve({
        workspaceId: "workspace_1",
        phone: "+5511999999999",
      }),
    ).resolves.toEqual({
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      lead: {
        id: "lead_1",
        phoneHash: "hash_1",
        campaignId: "campaign_1",
        adSetId: "adset_1",
        adId: "ad_1",
        ctwaClid: "ctwa_1",
      },
    });
  });
});
