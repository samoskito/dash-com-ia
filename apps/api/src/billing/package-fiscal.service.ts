import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type BillingInvoiceStatus,
  type PlatformFiscalSettings,
  type WorkspaceSubscription
} from "@prisma/client";
import type {
  PlatformFiscalSettingsDto,
  PlatformFiscalSettingsInputDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  PackageAsaasAdapter,
  PackageAsaasError
} from "./package-asaas.adapter";
import { PackageBillingConfiguration } from "./package-billing.configuration";

const PLATFORM_FISCAL_SETTINGS_ID = "platform";

@Injectable()
export class PackageFiscalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(PackageAsaasAdapter)
    private readonly asaas: PackageAsaasAdapter
  ) {}

  async getSettings(): Promise<PlatformFiscalSettingsDto | null> {
    const settings = await this.prisma.platformFiscalSettings.findUnique({
      where: { id: PLATFORM_FISCAL_SETTINGS_ID }
    });
    return settings ? this.mapSettings(settings) : null;
  }

  async saveSettings(
    input: PlatformFiscalSettingsInputDto,
    actorUserId: string
  ): Promise<PlatformFiscalSettingsDto> {
    const settings = await this.prisma.platformFiscalSettings.upsert({
      where: { id: PLATFORM_FISCAL_SETTINGS_ID },
      create: {
        id: PLATFORM_FISCAL_SETTINGS_ID,
        enabled: input.enabled,
        effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
        municipalServiceId: input.municipalServiceId,
        municipalServiceCode: input.municipalServiceCode,
        serviceDescription: input.serviceDescription,
        observations: input.observations,
        taxes: input.taxes ?? Prisma.JsonNull,
        validatedAt: new Date(),
        validatedByUserId: actorUserId,
        validationReason: input.validationReason
      },
      update: {
        enabled: input.enabled,
        effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
        municipalServiceId: input.municipalServiceId,
        municipalServiceCode: input.municipalServiceCode,
        serviceDescription: input.serviceDescription,
        observations: input.observations,
        taxes: input.taxes ?? Prisma.JsonNull,
        validatedAt: new Date(),
        validatedByUserId: actorUserId,
        validationReason: input.validationReason
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        actorType: "platform_owner",
        action: "billing.fiscal_settings_validated",
        targetType: "PlatformFiscalSettings",
        targetId: settings.id,
        reason: input.validationReason,
        resultStatus: "success",
        afterSummary: {
          enabled: settings.enabled,
          effectiveDatePeriod: settings.effectiveDatePeriod,
          municipalServiceId: settings.municipalServiceId,
          municipalServiceCode: settings.municipalServiceCode
        }
      }
    });

    return this.mapSettings(settings);
  }

  async configureAfterPayment(input: {
    contract: WorkspaceSubscription;
    paymentChargeId: string;
    providerPaymentId: string;
    amountCents: number;
  }): Promise<void> {
    if (
      !this.configuration.isPackageBillingEnabled() ||
      !this.configuration.isFiscalEnabled()
    ) {
      return;
    }

    const invoice = await this.prisma.billingInvoice.upsert({
      where: {
        provider_providerPaymentId: {
          provider: "asaas",
          providerPaymentId: input.providerPaymentId
        }
      },
      create: {
        workspaceId: input.contract.workspaceId,
        subscriptionId: input.contract.id,
        paymentChargeId: input.paymentChargeId,
        providerPaymentId: input.providerPaymentId,
        status: "pending_configuration",
        amountCents: input.amountCents,
        lastAttemptAt: new Date()
      },
      update: {
        paymentChargeId: input.paymentChargeId,
        amountCents: input.amountCents,
        lastAttemptAt: new Date()
      }
    });

    const settings = await this.prisma.platformFiscalSettings.findUnique({
      where: { id: PLATFORM_FISCAL_SETTINGS_ID }
    });
    if (!settings?.enabled || !settings.validatedAt) {
      await this.setFiscalFailure(
        input.contract,
        invoice.id,
        "fiscal_settings_not_validated"
      );
      return;
    }
    if (!input.contract.asaasSubscriptionId) {
      await this.setFiscalFailure(
        input.contract,
        invoice.id,
        "asaas_subscription_not_bound"
      );
      return;
    }

    const charge = await this.prisma.paymentCharge.findUnique({
      where: { id: input.paymentChargeId }
    });
    const externalReference = `wpptrack:invoice:${invoice.id}`;

    try {
      const remoteInvoice =
        (invoice.providerInvoiceId
          ? {
              id: invoice.providerInvoiceId,
              status: invoice.status,
              paymentId: input.providerPaymentId,
              externalReference
            }
          : await this.asaas.findSubscriptionInvoice(
              input.contract.asaasSubscriptionId,
              externalReference
            )) ??
        (await this.asaas.schedulePaymentInvoice({
          paymentId: input.providerPaymentId,
          externalReference,
          serviceDescription: settings.serviceDescription,
          observations: settings.observations,
          amountCents: input.amountCents,
          effectiveDate: this.asaasDate(
            charge?.paidAt ?? charge?.dueAt ?? new Date()
          ),
          municipalServiceId: settings.municipalServiceId,
          municipalServiceCode: settings.municipalServiceCode,
          taxes: this.jsonObject(settings.taxes)
        }));

      await this.prisma.$transaction([
        this.prisma.billingInvoice.update({
          where: { id: invoice.id },
          data: {
            providerInvoiceId: remoteInvoice.id,
            status: "scheduled",
            lastErrorCode: null,
            lastErrorMessage: null,
            lastAttemptAt: new Date()
          }
        }),
        this.prisma.workspaceSubscription.update({
          where: { id: input.contract.id },
          data: {
            fiscalStatus: "scheduled",
            fiscalLastErrorCode: null,
            fiscalLastErrorAt: null
          }
        })
      ]);

      await this.configureFutureInvoices(
        input.contract,
        settings
      );
    } catch (error) {
      const code =
        error instanceof PackageAsaasError
          ? error.code
          : "fiscal_invoice_schedule_failed";
      await this.setFiscalFailure(input.contract, invoice.id, code);
    }
  }

  async retryInvoice(
    invoiceId: string,
    actorUserId: string
  ): Promise<boolean> {
    const invoice = await this.prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true }
    });
    if (
      !invoice ||
      !invoice.providerPaymentId ||
      !invoice.paymentChargeId ||
      invoice.amountCents === null
    ) {
      return false;
    }

    await this.configureAfterPayment({
      contract: invoice.subscription,
      paymentChargeId: invoice.paymentChargeId,
      providerPaymentId: invoice.providerPaymentId,
      amountCents: invoice.amountCents
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        actorType: "platform_owner",
        action: "billing.invoice_retry_requested",
        targetType: "BillingInvoice",
        targetId: invoice.id,
        resultStatus: "success",
        afterSummary: {
          workspaceId: invoice.workspaceId,
          providerPaymentId: invoice.providerPaymentId
        }
      }
    });
    return true;
  }

  async listActionableInvoices() {
    return this.prisma.billingInvoice.findMany({
      where: {
        status: {
          in: ["pending_configuration", "failed", "rejected"]
        }
      },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true }
        },
        subscription: {
          select: {
            id: true,
            planNameSnapshot: true,
            fiscalLastErrorCode: true
          }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: 200
    });
  }

  async recordInvoiceEvent(input: {
    providerInvoiceId: string;
    providerPaymentId: string | null;
    status: BillingInvoiceStatus;
    issuedAt?: Date | null;
    authorizedAt?: Date | null;
    canceledAt?: Date | null;
  }): Promise<boolean> {
    const existing = await this.prisma.billingInvoice.findFirst({
      where: {
        OR: [
          {
            provider: "asaas",
            providerInvoiceId: input.providerInvoiceId
          },
          ...(input.providerPaymentId
            ? [
                {
                  provider: "asaas",
                  providerPaymentId: input.providerPaymentId
                }
              ]
            : [])
        ]
      }
    });
    if (!existing) {
      return false;
    }

    const failure =
      input.status === "failed" || input.status === "rejected";
    await this.prisma.$transaction([
      this.prisma.billingInvoice.update({
        where: { id: existing.id },
        data: {
          providerInvoiceId: input.providerInvoiceId,
          status: input.status,
          issuedAt: input.issuedAt,
          authorizedAt: input.authorizedAt,
          canceledAt: input.canceledAt,
          lastErrorCode: failure ? input.status : null,
          lastErrorMessage: failure ? input.status : null,
          lastAttemptAt: new Date()
        }
      }),
      this.prisma.workspaceSubscription.update({
        where: { id: existing.subscriptionId },
        data: {
          fiscalStatus: failure ? "failed" : input.status,
          fiscalLastErrorCode: failure ? input.status : null,
          fiscalLastErrorAt: failure ? new Date() : null
        }
      })
    ]);
    return true;
  }

  private async setFiscalFailure(
    contract: WorkspaceSubscription,
    invoiceId: string,
    code: string
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.billingInvoice.update({
        where: { id: invoiceId },
        data: {
          status: "failed",
          retryCount: { increment: 1 },
          lastErrorCode: code,
          lastErrorMessage: code,
          lastAttemptAt: new Date()
        }
      }),
      this.prisma.workspaceSubscription.update({
        where: { id: contract.id },
        data: {
          fiscalStatus: "failed",
          fiscalLastErrorCode: code,
          fiscalLastErrorAt: new Date()
        }
      })
    ]);
  }

  private async configureFutureInvoices(
    contract: WorkspaceSubscription,
    settings: PlatformFiscalSettings
  ): Promise<void> {
    if (!contract.asaasSubscriptionId) {
      return;
    }

    try {
      await this.asaas.upsertAutomaticInvoiceSettings({
        asaasSubscriptionId: contract.asaasSubscriptionId,
        municipalServiceId: settings.municipalServiceId,
        municipalServiceCode: settings.municipalServiceCode,
        observations: settings.observations,
        taxes: this.jsonObject(settings.taxes)
      });
    } catch (error) {
      const code =
        error instanceof PackageAsaasError
          ? error.code
          : "future_invoice_settings_failed";
      await this.prisma.billingContractAudit.create({
        data: {
          workspaceId: contract.workspaceId,
          subscriptionId: contract.id,
          planId: contract.planId,
          actorType: "system",
          action: "contract.future_invoice_settings_failed",
          reason: code,
          providerReferences: {
            asaasSubscriptionId: contract.asaasSubscriptionId
          }
        }
      });
    }
  }

  private mapSettings(
    settings: PlatformFiscalSettings
  ): PlatformFiscalSettingsDto {
    return {
      enabled: settings.enabled,
      effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
      municipalServiceId: settings.municipalServiceId,
      municipalServiceCode: settings.municipalServiceCode,
      serviceDescription: settings.serviceDescription,
      observations: settings.observations,
      taxes: this.numericRecord(settings.taxes),
      validatedAt: settings.validatedAt?.toISOString() ?? null,
      updatedAt: settings.updatedAt.toISOString()
    };
  }

  private jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
    return value &&
      typeof value === "object" &&
      !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private numericRecord(
    value: Prisma.JsonValue
  ): Record<string, number> | null {
    const object = this.jsonObject(value);
    const entries = Object.entries(object).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1])
    );
    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }

  private asaasDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
