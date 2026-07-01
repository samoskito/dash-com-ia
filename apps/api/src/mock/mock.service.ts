import { Injectable } from "@nestjs/common";
import type { ReportOverviewDto } from "@wpptrack/shared";

@Injectable()
export class MockService {
  getReportOverview(): ReportOverviewDto {
    return {
      workspaceId: "workspace_demo",
      rangeLabel: "Ultimos 7 dias",
      campaigns: [
        {
          id: "cmp_black_friday",
          name: "Black Friday WhatsApp",
          status: "active",
          spendCents: 120000,
          metaConversationsStarted: 176,
          costPerMetaConversationCents: 681,
          realConversations: 142,
          costPerRealConversationCents: 845,
          leadSubmitted: 61,
          costPerLeadSubmittedCents: 1967,
          qualifiedLead: 28,
          costPerQualifiedLeadCents: 4285,
          purchase: 9,
          costPerPurchaseCents: 13333,
          roas: 5.4
        }
      ]
    };
  }
}
