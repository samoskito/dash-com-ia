import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { z, ZodError } from "zod";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { EmailQueueService } from "../email/email-queue.service";
import { LicenseDeliverySecretService } from "./license-delivery-secret.service";
import { LicenseWhatsappNotifier } from "./license-whatsapp.notifier";

const DELIVERY_ARTIFACT_TTL_DAYS = 7;
const DEFAULT_REPO_URL = "https://github.com/samoskito/nod-rastrackdash-wpp";
const DEFAULT_PRODUCT_NAME = "RastrackDash";
const supportEmailSchema = z.string().trim().max(320).email();

/**
 * The license_key_delivery email envelope is validated strictly (Zod) before
 * it ever reaches the queue. Env-driven fields must be sanitized here so a
 * misconfigured/invalid env var (bad URL, bad email) never throws out of
 * `encrypt()` and silently drops the whole enqueue+audit before it starts.
 */
function sanitizeRepoUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    return DEFAULT_REPO_URL;
  }
  try {
    new URL(value);
    return value;
  } catch {
    return DEFAULT_REPO_URL;
  }
}

function sanitizeSupportEmail(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = supportEmailSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function sanitizeProductName(raw: string | undefined): string {
  const cleaned = raw?.replace(/[\r\n]+/g, " ").trim();
  if (!cleaned) {
    return DEFAULT_PRODUCT_NAME;
  }
  return cleaned.slice(0, 200);
}

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

export type EmailSkipOrFailReason =
  | "missing_email"
  | "queue_disabled"
  | "channel_excluded"
  | "zod_envelope"
  | "enqueue_failed";

export type WhatsappSkipOrFailReason =
  | "empty_phone"
  | "not_configured"
  | "channel_excluded"
  | "send_failed"
  | "network";

export type NotifyLicenseIssuedResult = {
  email: "queued" | "skipped" | "failed";
  emailReason?: EmailSkipOrFailReason;
  whatsapp: "sent" | "skipped" | "failed";
  whatsappReason?: WhatsappSkipOrFailReason;
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
    // Explicit @Inject(EmailQueueService) — required, not @Optional(). A prior
    // `import type { EmailQueueService }` erased the class at runtime, so
    // Nest's implicit (design:paramtypes) resolution silently injected
    // undefined and every resend/notify email was skipped even with SMTP
    // configured. EmailModule is @Global() and always loaded (see
    // licensing.module.ts imports), so this fails fast at boot instead.
    @Inject(EmailQueueService) private readonly emailQueue: EmailQueueService,
    private readonly deliverySecrets: LicenseDeliverySecretService,
    // Same rationale: required + explicit token rather than relying on
    // implicit type-based DI for a same-module provider.
    @Inject(LicenseWhatsappNotifier)
    private readonly whatsapp: LicenseWhatsappNotifier,
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
    return {
      email: email.status,
      emailReason: email.reason,
      whatsapp: whatsapp.status,
      whatsappReason: whatsapp.reason,
    };
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
      channel === "whatsapp"
        ? { status: "skipped" as const, reason: "channel_excluded" as const }
        : await this.sendEmail(baseInput);
    const whatsapp =
      channel === "email"
        ? { status: "skipped" as const, reason: "channel_excluded" as const }
        : await this.sendWhatsapp(baseInput);

    return {
      licenseId: license.id,
      email: email.status,
      emailReason: email.reason,
      whatsapp: whatsapp.status,
      whatsappReason: whatsapp.reason,
    };
  }

  private async sendEmail(input: NotifyLicenseIssuedInput): Promise<{
    status: NotifyLicenseIssuedResult["email"];
    reason?: EmailSkipOrFailReason;
  }> {
    if (!input.license.buyerEmail) {
      this.logger.debug("license_notify_email_skipped reason=missing_email");
      return { status: "skipped", reason: "missing_email" };
    }
    if (!this.emailQueue.isEnabled()) {
      this.logger.debug("license_notify_email_skipped reason=queue_disabled");
      return { status: "skipped", reason: "queue_disabled" };
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
            productName: sanitizeProductName(this.env.LICENSE_NOTIFY_PRODUCT_NAME),
            repoUrl: sanitizeRepoUrl(this.env.LICENSE_NOTIFY_REPO_URL),
            supportEmail: sanitizeSupportEmail(this.env.LICENSE_NOTIFY_SUPPORT_EMAIL),
          },
        },
      });
      return { status: "queued" };
    } catch (error) {
      const reason: EmailSkipOrFailReason =
        error instanceof ZodError ? "zod_envelope" : "enqueue_failed";
      this.logger.warn(`license_notify_email_failed reason=${reason}`);
      return { status: "failed", reason };
    }
  }

  private async sendWhatsapp(input: NotifyLicenseIssuedInput): Promise<{
    status: NotifyLicenseIssuedResult["whatsapp"];
    reason?: WhatsappSkipOrFailReason;
  }> {
    if (!input.phoneE164) {
      this.logger.debug("license_notify_whatsapp_skipped reason=empty_phone");
      return { status: "skipped", reason: "empty_phone" };
    }
    if (!this.whatsapp.isConfigured()) {
      this.logger.debug("license_notify_whatsapp_skipped reason=not_configured");
      return { status: "skipped", reason: "not_configured" };
    }
    try {
      const productName = sanitizeProductName(this.env.LICENSE_NOTIFY_PRODUCT_NAME);
      const message = `${productName}: sua licenca e ${input.rawKey}. Guarde este codigo em local seguro.`;
      const sent = await this.whatsapp.sendLicenseKey(input.phoneE164, message);
      return sent ? { status: "sent" } : { status: "failed", reason: "send_failed" };
    } catch {
      this.logger.warn("license_notify_whatsapp_failed reason=network");
      return { status: "failed", reason: "network" };
    }
  }
}
