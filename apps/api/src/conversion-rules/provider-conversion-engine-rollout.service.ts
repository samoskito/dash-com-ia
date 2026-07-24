import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ProviderConversionDecisionDto } from "@wpptrack/shared";
import { ProviderConversionDecisionEngine } from "./provider-conversion-decision.engine";
import type { ProviderConversionDecisionInput } from "./provider-conversion-decision.types";
import { ProviderConversionLegacyDecisionEngine } from "./provider-conversion-legacy-decision.engine";
import {
  type ProviderConversionEngineMode,
  ProviderConversionShadowComparisonService,
} from "./provider-conversion-shadow-comparison.service";

@Injectable()
export class ProviderConversionEngineRolloutService {
  private readonly logger = new Logger(
    ProviderConversionEngineRolloutService.name,
  );

  constructor(
    @Inject(ProviderConversionDecisionEngine)
    private readonly canonical: ProviderConversionDecisionEngine,
    @Inject(ProviderConversionLegacyDecisionEngine)
    private readonly legacy: ProviderConversionLegacyDecisionEngine,
    @Inject(ProviderConversionShadowComparisonService)
    private readonly comparisons: ProviderConversionShadowComparisonService,
  ) {}

  async evaluate(input: {
    mode: ProviderConversionEngineMode;
    decisionInput: ProviderConversionDecisionInput;
    sourceDeliveryId: string;
  }): Promise<ProviderConversionDecisionDto | null> {
    if (input.mode === "canonical") {
      return this.canonical.evaluate(input.decisionInput);
    }

    const legacyDecision = this.legacy.evaluate(input.decisionInput);
    if (input.mode !== "shadow") return legacyDecision;

    const canonicalDecision = this.canonical.evaluate(input.decisionInput);
    const occurrence = input.decisionInput.occurrence;
    if (!occurrence.channelId) {
      this.logger.warn(
        JSON.stringify({
          event: "provider_conversion_shadow_skipped",
          reasonCode: "channel_unresolved",
          providerRuleId: input.decisionInput.rule.providerRuleId,
          occurrenceKey: occurrence.occurrenceKey,
        }),
      );
      return legacyDecision;
    }

    try {
      const comparison = await this.comparisons.record({
        workspaceId: occurrence.workspaceId,
        providerRuleId: input.decisionInput.rule.providerRuleId,
        sourceDeliveryId: input.sourceDeliveryId,
        channelId: occurrence.channelId,
        occurrenceKey: occurrence.occurrenceKey,
        authoritativeEngine: "legacy",
        legacyDecision,
        canonicalDecision,
      });
      this.logger.log(
        JSON.stringify({
          event: "provider_conversion_shadow_compared",
          comparisonId: comparison.id,
          traceId: comparison.id,
          workspaceId: occurrence.workspaceId,
          channelId: occurrence.channelId,
          providerRuleId: input.decisionInput.rule.providerRuleId,
          occurrenceKey: occurrence.occurrenceKey,
          matches: comparison.matches,
          mismatchCode: comparison.mismatchCode,
          created: comparison.created,
        }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: "provider_conversion_shadow_comparison_failed",
          workspaceId: occurrence.workspaceId,
          channelId: occurrence.channelId,
          providerRuleId: input.decisionInput.rule.providerRuleId,
          occurrenceKey: occurrence.occurrenceKey,
          errorName:
            error instanceof Error ? error.name : "UnknownShadowError",
        }),
      );
    }

    return legacyDecision;
  }
}
