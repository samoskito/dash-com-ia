import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import type { EmailQueueService } from "../email/email-queue.service";
import { LicenseDeliverySecretService } from "./license-delivery-secret.service";
import { LicenseWhatsappNotifier } from "./license-whatsapp.notifier";

const DELIVERY_ARTIFACT_TTL_DAYS = 7;
const DEFAULT_REPO_URL = "https://github.com/samoskito/nod-rastrackdash-wpp";
const DEFAULT_PRODUCT_NAME = "RastrackDash";

export type NotifyLicenseIssuedInput = {
  license: {
    id: string;
    keyPrefix: string;
    buyerEmail: string | null;
    buyerName: string | null;
    expiresAt: Date;
    issuedAt: Date;
  };
  rawKey: string;
  phoneE164?: string | null;
  reason: "issue" | "resend";
  resendNonce?: string;
};

export type NotifyLicenseIssuedResult = {
  email: "queued" | "skipped" | "failed";
  whatsapp: "sent" | "skipped" | "failed";
};

export type ResendLicenseDeliveryInput = {
  licenseId: string;
  phoneE164?: string | null;
  channel?: "email" | "whatsapp" | "both";
};

export type ResendLicenseDeliveryResult = NotifyLicenseIssuedResult & {
  licenseId: string;
};

@Injectable()
export class LicenseNotificationService {
  private readonly logger = new Logger(LicenseNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailQueue: EmailQueueService | undefined,
    private readonly deliverySecrets: LicenseDeliverySecretService,
    @Optional() private readonly whatsapp: LicenseWhatsappNotifier | undefined,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  async storeDeliveryArtifact(
    licenseId: string,
    rawKey: string,
    now = new Date(),
  ): Promise<void> {
    try {
      const encrypted = this.deliverySecrets.encrypt(licenseId, rawKey);
      const expiresAt = new Date(
        now.getTime() + DELIVERY_ARTIFACT_TTL_DAYS * 24 * 60 * 60 * 1000,
      );
      await this.prisma.licenseDeliveryArtifact.upsert({
        where: { licenseId },
        create: {
          licenseId,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          expiresAt,
        },
        update: {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          expiresAt,
        },
      });
    } catch {
      this.logger.warn("license_notify_store_artifact_failed");
    }
  }

  async notifyLicenseIssued(
    input: NotifyLicenseIssuedInput,
  ): Promise<NotifyLicenseIssuedResult> {
    if (input.reason === "issue") {
      await this.storeDeliveryArtifact(
        input.license.id,
        input.rawKey,
        input.license.issuedAt,
      );
    }

    const email = await this.sendEmail(input);
    const whatsapp = await this.sendWhatsapp(input);
    return { email, whatsapp };
  }

  /**
   * Admin resend: decrypt short-lived artifact and redeliver.
   * Never returns the raw key to the HTTP caller.
   */
  async resendDelivery(
    input: ResendLicenseDeliveryInput,
  ): Promise<ResendLicenseDeliveryResult> {
    const license = await this.prisma.license.findUnique({
      where: { id: input.licenseId },
    });
    if (!license) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          code: "license_not_found",
          message: "Licenca nao encontrada",
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const artifact = await this.prisma.licenseDeliveryArtifact.findUnique({
      where: { licenseId: input.licenseId },
    });
    const now = new Date();
    if (!artifact || artifact.expiresAt.getTime() <= now.getTime()) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: "license_key_unrecoverable",
          message:
            "Chave nao recuperavel para reenvio. Artefato expirado ou ausente; emita nova licenca se necessario.",
        },
        HttpStatus.CONFLICT,
      );
    }

    let rawKey: string;
    try {
      rawKey = this.deliverySecrets.decrypt(input.licenseId, {
        ciphertext: artifact.ciphertext,
        iv: artifact.iv,
        authTag: artifact.authTag,
      });
    } catch {
      this.logger.warn("license_notify_resend_decrypt_failed");
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          code: "license_key_unrecoverable",
          message: "Chave nao recuperavel para reenvio.",
        },
        HttpStatus.CONFLICT,
      );
    }

    const channel = input.channel ?? "both";
    const baseInput: NotifyLicenseIssuedInput = {
      license: {
        id: license.id,
        keyPrefix: license.keyPrefix,
        buyerEmail: license.buyerEmail,
        buyerName: license.buyerName,
        expiresAt: license.expiresAt,
        issuedAt: license.issuedAt,
      },
      rawKey,
      phoneE164: input.phoneE164 ?? null,
      reason: "resend",
      resendNonce: `${now.toISOString()}:${Math.random().toString(36).slice(2, 10)}`,
    };

    const email =
      channel === "whatsapp" ? ("skipped" as const) : await this.sendEmail(baseInput);
    const whatsapp =
      channel === "email"
        ? ("skipped" as const)
        : await this.sendWhatsapp(baseInput);

    return { licenseId: license.id, email, whatsapp };
  }

  private async sendEmail(
    input: NotifyLicenseIssuedInput,
  ): Promise<NotifyLicenseIssuedResult["email"]> {
    if (!input.license.buyerEmail) {
      return "skipped";
    }
    if (!this.emailQueue || !this.emailQueue.isEnabled()) {
      return "skipped";
    }
    try {
      await this.emailQueue.enqueue({
        workspaceId: null,
        action: {
          type: "License",
          id: input.license.id,
          version:
            input.reason === "issue"
              ? `issue:${input.license.issuedAt.toISOString()}`
              : `resend:${input.resendNonce ?? Date.now().toString(36)}`,
        },
        envelope: {
          to: {
            address: input.license.buyerEmail,
            name: input.license.buyerName ?? undefined,
          },
          template: "license_key_delivery",
          data: {
            recipientName: input.license.buyerName ?? undefined,
            licenseKey: input.rawKey,
            keyPrefix: input.license.keyPrefix,
            expiresAt: input.license.expiresAt.toISOString(),
            productName:
              this.env.LICENSE_NOTIFY_PRODUCT_NAME?.trim() || DEFAULT_PRODUCT_NAME,
            repoUrl: this.env.LICENSE_NOTIFY_REPO_URL?.trim() || DEFAULT_REPO_URL,
            supportEmail:
              this.env.LICENSE_NOTIFY_SUPPORT_EMAIL?.trim() || undefined,
          },
        },
      });
      return "queued";
    } catch {
      this.logger.warn("license_notify_email_failed");
      return "failed";
    }
  }

  private async sendWhatsapp(
    input: NotifyLicenseIssuedInput,
  ): Promise<NotifyLicenseIssuedResult["whatsapp"]> {
    if (!input.phoneE164) {
      return "skipped";
    }
    if (!this.whatsapp || !this.whatsapp.isConfigured()) {
      return "skipped";
    }
    try {
      const productName =
        this.env.LICENSE_NOTIFY_PRODUCT_NAME?.trim() || DEFAULT_PRODUCT_NAME;
      const message = `${productName}: sua licenca e ${input.rawKey}. Guarde este codigo em local seguro.`;
      const sent = await this.whatsapp.sendLicenseKey(input.phoneE164, message);
      return sent ? "sent" : "failed";
    } catch {
      this.logger.warn("license_notify_whatsapp_failed");
      return "failed";
    }
  }
}
