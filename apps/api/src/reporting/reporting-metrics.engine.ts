import type { FunnelStageConfigurationDto } from "@wpptrack/shared";

export type ReportingMetricScope = {
  adId?: string | null;
  adSetId?: string | null;
  campaignId?: string | null;
};

export type ReportingInsightInput = {
  spendCents: number;
  metaConversationsStarted: number | null;
};

export type ReportingMetricLead = {
  id: string;
  phoneHash: string | null;
  customerIdentityKey?: string | null;
  businessSource?: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  ctwaClid?: string | null;
  firstMessageAt: Date | null;
};

export type ReportingMetricEvent = {
  id: string;
  phoneHash: string | null;
  customerIdentityKey?: string | null;
  businessSource?: string | null;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  ctwaClid?: string | null;
  eventName: string;
  eventOccurredAt: Date;
  status: string;
  valueCents: number | null;
  valueSource?: string | null;
  currency: string | null;
  purchaseKind?: string | null;
};

export type ReportingMetricsCalculationInput = {
  configuredEvents?: Set<string>;
  funnelStages?: FunnelStageConfigurationDto[];
  events: ReportingMetricEvent[];
  insight: ReportingInsightInput;
  leads: ReportingMetricLead[];
  scope: ReportingMetricScope;
};

type FunnelStepKey = string;

type ReportingFunnelStep = {
  key: FunnelStepKey;
  label: string;
  value: number;
  costCents?: number | null;
  unavailableReason?: string;
};

export type ReportingMetricsResult = {
  spendCents: number;
  metaConversationsStarted: number;
  costPerMetaConversationCents: number | null;
  realConversations: number;
  costPerRealConversationCents: number | null;
  organicLeads: number;
  totalReceived: number;
  trackingRate: number | null;
  qualifiedLead: number;
  costPerQualifiedLeadCents: number | null;
  purchases: number;
  firstPurchases: number;
  repurchases: number;
  costPerPurchaseCents: number | null;
  trafficRevenueCents: number;
  organicRevenueCents: number;
  totalRevenueCents: number;
  firstPurchaseRevenueCents: number;
  repurchaseRevenueCents: number;
  estimatedRevenueCents: number;
  hasEstimatedRevenue: boolean;
  roasAcquisition: number | null;
  roasWithRepurchase: number | null;
  funnelSteps: ReportingFunnelStep[];
};

type ClassifiedPurchase = {
  event: ReportingMetricEvent;
  kind: "first_purchase" | "repurchase";
  source: "paid" | "organic";
};

const funnelLabels: Record<FunnelStepKey, string> = {
  first_purchase: "Primeira compra",
  purchase: "Compras",
  qualified_lead: "Lead qualificado",
  real_conversations: "Conversas reais iniciadas",
  repurchase: "Recompra",
};

export class ReportingMetricsEngine {
  calculate(input: ReportingMetricsCalculationInput): ReportingMetricsResult {
    const scopedLeads = input.leads.filter((lead) =>
      this.matchesScope(lead, input.scope),
    );
    const scopedEvents = input.events.filter((event) =>
      this.matchesScope(event, input.scope),
    );
    const countableEvents = scopedEvents.filter((event) =>
      this.isCountableEvent(event),
    );
    const spendCents = input.insight.spendCents;
    const metaConversationsStarted =
      input.insight.metaConversationsStarted ?? 0;
    const realConversationIds = this.realConversationIds(
      scopedLeads,
      countableEvents,
    );
    const organicLeadIds = this.organicLeadIds(scopedLeads, countableEvents);
    const realConversations = realConversationIds.size;
    const organicLeads = organicLeadIds.size;
    const totalReceived = realConversations + organicLeads;
    const qualifiedLead = countableEvents.filter(
      (event) => event.eventName === "QualifiedLead",
    ).length;
    const purchases = this.classifyPurchases(countableEvents);
    const firstPurchases = purchases.filter(
      (purchase) => purchase.kind === "first_purchase",
    ).length;
    const repurchases = purchases.filter(
      (purchase) => purchase.kind === "repurchase",
    ).length;
    const trafficPurchases = purchases.filter(
      (purchase) => purchase.source === "paid",
    );
    const organicPurchases = purchases.filter(
      (purchase) => purchase.source === "organic",
    );
    const trafficRevenueCents = this.sumPurchaseValue(trafficPurchases);
    const organicRevenueCents = this.sumPurchaseValue(organicPurchases);
    const firstPurchaseRevenueCents = this.sumPurchaseValue(
      purchases.filter((purchase) => purchase.kind === "first_purchase"),
    );
    const repurchaseRevenueCents = this.sumPurchaseValue(
      purchases.filter((purchase) => purchase.kind === "repurchase"),
    );
    const trafficFirstPurchaseRevenueCents = this.sumPurchaseValue(
      trafficPurchases.filter((purchase) => purchase.kind === "first_purchase"),
    );
    const trafficRepurchaseRevenueCents = this.sumPurchaseValue(
      trafficPurchases.filter((purchase) => purchase.kind === "repurchase"),
    );
    const estimatedRevenueCents = this.sumPurchaseValue(
      purchases.filter(
        (purchase) => purchase.event.valueSource === "configured_average",
      ),
    );

    return {
      spendCents,
      metaConversationsStarted,
      costPerMetaConversationCents: this.costPer(
        spendCents,
        metaConversationsStarted,
      ),
      realConversations,
      costPerRealConversationCents: this.costPer(
        spendCents,
        realConversations,
      ),
      organicLeads,
      totalReceived,
      trackingRate:
        totalReceived > 0 ? realConversations / totalReceived : null,
      qualifiedLead,
      costPerQualifiedLeadCents: this.costPer(spendCents, qualifiedLead),
      purchases: purchases.length,
      firstPurchases,
      repurchases,
      costPerPurchaseCents: this.costPer(spendCents, purchases.length),
      trafficRevenueCents,
      organicRevenueCents,
      totalRevenueCents: trafficRevenueCents + organicRevenueCents,
      firstPurchaseRevenueCents,
      repurchaseRevenueCents,
      estimatedRevenueCents,
      hasEstimatedRevenue: estimatedRevenueCents > 0,
      roasAcquisition: this.roas(trafficFirstPurchaseRevenueCents, spendCents),
      roasWithRepurchase: this.roas(
        trafficFirstPurchaseRevenueCents + trafficRepurchaseRevenueCents,
        spendCents,
      ),
      funnelSteps: this.funnelSteps({
        configuredEvents: input.configuredEvents ?? new Set(),
        funnelStages: input.funnelStages,
        countableEvents,
        firstPurchases,
        purchases: purchases.length,
        qualifiedLead,
        realConversations,
        repurchaseRevenueCents,
        repurchases,
        spendCents,
        firstPurchaseRevenueCents,
      }),
    };
  }

  private realConversationIds(
    leads: ReportingMetricLead[],
    events: ReportingMetricEvent[],
  ): Set<string> {
    const ids = new Set<string>();

    for (const lead of leads) {
      if (this.isPaidRealConversation(lead)) {
        ids.add(this.identityKey(lead, `lead:${lead.id}`));
      }
    }

    for (const event of events) {
      if (event.eventName === "LeadSubmitted" && this.isPaidLeadEvent(event)) {
        ids.add(this.identityKey(event, `event:${event.id}`));
      }
    }

    return ids;
  }

  private organicLeadIds(
    leads: ReportingMetricLead[],
    events: ReportingMetricEvent[],
  ): Set<string> {
    const ids = new Set<string>();

    for (const lead of leads) {
      if (this.isOrganic(lead)) {
        ids.add(this.identityKey(lead, `lead:${lead.id}`));
      }
    }

    for (const event of events) {
      if (event.eventName === "LeadSubmitted" && this.isOrganic(event)) {
        ids.add(this.identityKey(event, `event:${event.id}`));
      }
    }

    return ids;
  }

  private classifyPurchases(
    events: ReportingMetricEvent[],
  ): ClassifiedPurchase[] {
    const purchases = events
      .filter((event) => event.eventName === "Purchase")
      .sort((a, b) => {
        const timeDelta =
          a.eventOccurredAt.getTime() - b.eventOccurredAt.getTime();

        return timeDelta === 0 ? a.id.localeCompare(b.id) : timeDelta;
      });
    const seenIdentity = new Set<string>();

    return purchases.map((event) => {
      const explicitKind = this.explicitPurchaseKind(event.purchaseKind);
      const identity = this.optionalIdentityKey(event);
      const kind =
        explicitKind ??
        (identity && seenIdentity.has(identity)
          ? "repurchase"
          : "first_purchase");

      if (identity) {
        seenIdentity.add(identity);
      }

      return {
        event,
        kind,
        source: this.isOrganic(event) ? "organic" : "paid",
      };
    });
  }

  private funnelSteps(input: {
    configuredEvents: Set<string>;
    funnelStages?: FunnelStageConfigurationDto[];
    countableEvents: ReportingMetricEvent[];
    firstPurchaseRevenueCents: number;
    firstPurchases: number;
    purchases: number;
    qualifiedLead: number;
    realConversations: number;
    repurchaseRevenueCents: number;
    repurchases: number;
    spendCents: number;
  }): ReportingFunnelStep[] {
    if (input.funnelStages) {
      return input.funnelStages
        .filter((stage) => stage.visible)
        .sort((left, right) => left.position - right.position)
        .flatMap((stage) => {
          const value = this.funnelStageValue(stage.eventName, input);
          const steps = [
            this.step(
              this.funnelStageKey(stage.eventName),
              stage.label,
              value,
              this.costPer(input.spendCents, value),
            ),
          ];

          if (stage.eventName === "Purchase") {
            if (input.firstPurchases > 0 || input.firstPurchaseRevenueCents > 0) {
              steps.push(
                this.step(
                  "first_purchase",
                  funnelLabels.first_purchase,
                  input.firstPurchases,
                  this.costPer(input.spendCents, input.firstPurchases),
                ),
              );
            }

            if (input.repurchases > 0 || input.repurchaseRevenueCents > 0) {
              steps.push(
                this.step(
                  "repurchase",
                  funnelLabels.repurchase,
                  input.repurchases,
                  this.costPer(input.spendCents, input.repurchases),
                ),
              );
            }
          }

          return steps;
        });
    }

    const steps: ReportingFunnelStep[] = [
      this.step(
        "real_conversations",
        funnelLabels.real_conversations,
        input.realConversations,
        this.costPer(input.spendCents, input.realConversations),
      ),
    ];
    const hasQualifiedLead =
      input.configuredEvents.has("QualifiedLead") ||
      input.countableEvents.some(
        (event) => event.eventName === "QualifiedLead",
      );
    const hasPurchase =
      input.configuredEvents.has("Purchase") ||
      input.countableEvents.some((event) => event.eventName === "Purchase");

    if (hasQualifiedLead) {
      steps.push(
        this.step(
          "qualified_lead",
          funnelLabels.qualified_lead,
          input.qualifiedLead,
          this.costPer(input.spendCents, input.qualifiedLead),
        ),
      );
    }

    if (hasPurchase) {
      steps.push(
        this.step(
          "purchase",
          funnelLabels.purchase,
          input.purchases,
          this.costPer(input.spendCents, input.purchases),
        ),
      );

      if (input.firstPurchases > 0 || input.firstPurchaseRevenueCents > 0) {
        steps.push(
          this.step(
            "first_purchase",
            funnelLabels.first_purchase,
            input.firstPurchases,
            this.costPer(input.spendCents, input.firstPurchases),
          ),
        );
      }

      if (input.repurchases > 0 || input.repurchaseRevenueCents > 0) {
        steps.push(
          this.step(
            "repurchase",
            funnelLabels.repurchase,
            input.repurchases,
            this.costPer(input.spendCents, input.repurchases),
          ),
        );
      }
    }

    return steps;
  }

  private step(
    key: FunnelStepKey,
    label: string,
    value: number,
    costCents: number | null,
  ): ReportingFunnelStep {
    return {
      key,
      label,
      value,
      costCents,
    };
  }

  private funnelStageValue(
    eventName: string,
    input: {
      countableEvents: ReportingMetricEvent[];
      purchases: number;
      qualifiedLead: number;
      realConversations: number;
    },
  ): number {
    if (eventName === "LeadSubmitted") {
      return input.realConversations;
    }

    if (eventName === "QualifiedLead") {
      return input.qualifiedLead;
    }

    if (eventName === "Purchase") {
      return input.purchases;
    }

    return input.countableEvents.filter((event) => event.eventName === eventName)
      .length;
  }

  private funnelStageKey(eventName: string): string {
    if (eventName === "LeadSubmitted") {
      return "real_conversations";
    }

    if (eventName === "QualifiedLead") {
      return "qualified_lead";
    }

    if (eventName === "Purchase") {
      return "purchase";
    }

    return `event_${eventName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`;
  }

  private matchesScope(
    item: ReportingMetricEvent | ReportingMetricLead,
    scope: ReportingMetricScope,
  ): boolean {
    if (scope.adId) {
      return item.adId === scope.adId;
    }

    if (scope.adSetId) {
      return item.adSetId === scope.adSetId;
    }

    if (scope.campaignId) {
      return item.campaignId === scope.campaignId;
    }

    return true;
  }

  private isCountableEvent(event: ReportingMetricEvent): boolean {
    return event.status !== "skipped";
  }

  private isPaidRealConversation(item: {
    businessSource?: string | null;
    campaignId: string | null;
    adSetId: string | null;
    adId: string | null;
    ctwaClid?: string | null;
  }): boolean {
    return !this.isOrganic(item) && this.hasAttribution(item);
  }

  private isPaidLeadEvent(item: {
    businessSource?: string | null;
    campaignId: string | null;
    adSetId: string | null;
    adId: string | null;
    ctwaClid?: string | null;
  }): boolean {
    return this.normalizedSource(item.businessSource) === "paid"
      ? true
      : !this.isOrganic(item);
  }

  private isOrganic(item: {
    businessSource?: string | null;
    campaignId: string | null;
    adSetId: string | null;
    adId: string | null;
    ctwaClid?: string | null;
  }): boolean {
    const source = this.normalizedSource(item.businessSource);

    if (source === "organic") {
      return true;
    }

    if (source === "paid") {
      return false;
    }

    return !this.hasAttribution(item);
  }

  private hasAttribution(item: {
    campaignId: string | null;
    adSetId: string | null;
    adId: string | null;
    ctwaClid?: string | null;
  }): boolean {
    return Boolean(
      item.campaignId || item.adSetId || item.adId || item.ctwaClid,
    );
  }

  private normalizedSource(value?: string | null): string | null {
    return value?.trim().toLowerCase() || null;
  }

  private explicitPurchaseKind(
    value?: string | null,
  ): "first_purchase" | "repurchase" | null {
    return value === "first_purchase" || value === "repurchase" ? value : null;
  }

  private optionalIdentityKey(item: {
    customerIdentityKey?: string | null;
    phoneHash: string | null;
  }): string | null {
    return item.customerIdentityKey || item.phoneHash || null;
  }

  private identityKey(
    item: {
      customerIdentityKey?: string | null;
      phoneHash: string | null;
    },
    fallback: string,
  ): string {
    return this.optionalIdentityKey(item) ?? fallback;
  }

  private sumPurchaseValue(purchases: ClassifiedPurchase[]): number {
    return purchases.reduce(
      (sum, purchase) => sum + (purchase.event.valueCents ?? 0),
      0,
    );
  }

  private costPer(spendCents: number, count: number): number | null {
    return count > 0 ? Math.floor(spendCents / count) : null;
  }

  private roas(revenueCents: number, spendCents: number): number | null {
    return revenueCents > 0 && spendCents > 0
      ? revenueCents / spendCents
      : null;
  }
}
