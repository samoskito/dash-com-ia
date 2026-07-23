import { Inject, Injectable } from "@nestjs/common";
import type { ProviderConversionPaidLeadResolutionDto } from "@wpptrack/shared";
import { hashPhoneIdentity } from "../common/phone/phone-identity";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class ProviderConversionPaidLeadResolver {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(input: {
    workspaceId: string;
    phone: string | null | undefined;
  }): Promise<ProviderConversionPaidLeadResolutionDto> {
    const phoneHash = hashPhoneIdentity(input.phone ?? undefined);
    if (!phoneHash) {
      return {
        status: "missing_identity",
        reasonCode: "missing_contact_identity",
      };
    }

    const candidates = await this.prisma.lead.findMany({
      where: {
        workspaceId: input.workspaceId,
        phoneHash,
      },
      select: {
        id: true,
        phoneHash: true,
        campaignId: true,
        adSetId: true,
        adId: true,
        ctwaClid: true,
      },
      take: 2,
    });

    if (candidates.length === 0) {
      return {
        status: "not_found",
        reasonCode: "paid_lead_not_found",
        candidateLeadId: null,
      };
    }
    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        reasonCode: "paid_lead_ambiguous",
        candidateLeadIds: candidates.map((candidate) => candidate.id),
      };
    }

    const lead = candidates[0]!;
    if (!lead.adId?.trim() || !lead.ctwaClid?.trim()) {
      return {
        status: "not_found",
        reasonCode: "paid_attribution_missing",
        candidateLeadId: lead.id,
      };
    }

    return {
      status: "resolved",
      reasonCode: "paid_lead_resolved",
      lead: {
        id: lead.id,
        phoneHash: lead.phoneHash,
        campaignId: lead.campaignId,
        adSetId: lead.adSetId,
        adId: lead.adId.trim(),
        ctwaClid: lead.ctwaClid.trim(),
      },
    };
  }
}
