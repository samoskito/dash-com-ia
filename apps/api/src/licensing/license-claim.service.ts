import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { License, LicenseClaim } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { normalizePhoneIdentityWithCountry } from "../common/phone/phone-identity";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { EmailQueueService } from "../email/email-queue.service";
import { LicenseAccountBindingService } from "./license-account-binding.service";
import { LicenseClaimCodeService } from "./license-claim-code.service";
import {
  hashClaimEmail,
  normalizeClaimEmail,
  readLicenseClaimConfig,
} from "./license-claim.config";
import { LicenseDeliverySecretService } from "./license-delivery-secret.service";
import { LicenseNotificationService } from "./license-notification.service";
import {
  LICENSE_CLAIM_CODE_COOLDOWN_MS,
  LICENSE_CLAIM_CODE_TTL_MS,
  LICENSE_CLAIM_ISSUING_STALE_MS,
  LICENSE_CLAIM_MAX_CODE_ATTEMPTS,
  LICENSE_CLAIM_MAX_CODES_PER_DAY,
} from "./licensing.constants";
import { LicensingService } from "./licensing.service";
import { StudentBaseMysqlAdapter } from "./student-base-mysql.adapter";

const LICENSE_PRODUCT_NAME = "RastrackDash";
const CODE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type ClaimRequestResult =
  | "eligible"
  | "not_eligible"
  | "invalid_email"
  | "cooldown"
  | "max_sends"
  | `mysql_unavailable:${string}`;

export type ClaimConfirmResult =
  | {
      status: "issued";
      licenseKey: string;
      accountIdentity: string;
      keyPrefix: string;
      expiresAt: string;
      emailDelivery: "queued" | "skipped" | "failed" | "not_resent";
    }
  | { status: "already_issued_contact_support" };

function throwCodeInvalid(): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.BAD_REQUEST,
      code: "license_claim_code_invalid",
      message: "Código inválido ou expirado.",
    },
    HttpStatus.BAD_REQUEST,
  );
}

function throwClaimInProgress(): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      code: "license_claim_in_progress",
      message: "A emissão da licença está em andamento.",
    },
    HttpStatus.CONFLICT,
  );
}

@Injectable()
export class LicenseClaimService {
  private readonly logger = new Logger(LicenseClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(StudentBaseMysqlAdapter)
    private readonly studentBase: StudentBaseMysqlAdapter,
    @Inject(LicenseClaimCodeService)
    private readonly codes: LicenseClaimCodeService,
    @Inject(LicensingService)
    private readonly licensing: LicensingService,
    @Inject(LicenseAccountBindingService)
    private readonly binding: LicenseAccountBindingService,
    @Inject(LicenseNotificationService)
    private readonly notifications: LicenseNotificationService,
    @Inject(LicenseDeliverySecretService)
    private readonly deliverySecrets: LicenseDeliverySecretService,
    @Inject(EmailQueueService)
    private readonly emailQueue: EmailQueueService,
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  /**
   * Eligibility and delivery deliberately happen outside the HTTP response.
   * Every failure is reduced to a reason code so callers never receive PII or
   * a signal that distinguishes eligible and ineligible addresses.
   */
  async processRequest(
    rawEmail: unknown,
    now = new Date(),
  ): Promise<ClaimRequestResult> {
    const email = normalizeClaimEmail(rawEmail);
    if (!email) {
      this.logRequest("invalid", "invalid_email");
      return "invalid_email";
    }

    const emailHash = hashClaimEmail(email);
    let lookup: Awaited<
      ReturnType<StudentBaseMysqlAdapter["findEligiblePurchase"]>
    >;
    try {
      lookup = await this.studentBase.findEligiblePurchase(email);
    } catch {
      this.logRequest(emailHash, "mysql_unavailable:query", true);
      return "mysql_unavailable:query";
    }

    if (lookup.kind === "not_eligible") {
      this.logRequest(emailHash, "not_eligible");
      return "not_eligible";
    }
    if (lookup.kind === "unavailable") {
      const result = `mysql_unavailable:${lookup.reason}` as const;
      this.logRequest(emailHash, result, true);
      return result;
    }

    try {
      const phoneE164 = normalizePhoneIdentityWithCountry(
        lookup.phone ?? undefined,
        "55",
      );
      const claim = await this.prisma.licenseClaim.upsert({
        where: { emailNormalized: email },
        create: {
          emailNormalized: email,
          status: "code_sent",
          sourceProduct: lookup.productName,
          buyerName: lookup.buyerName,
          phoneE164: phoneE164 ?? null,
        },
        update: {
          sourceProduct: lookup.productName,
          buyerName: lookup.buyerName,
          phoneE164: phoneE164 ?? null,
        },
      });

      if (
        claim.lastCodeSentAt &&
        now.getTime() - claim.lastCodeSentAt.getTime() <
          LICENSE_CLAIM_CODE_COOLDOWN_MS
      ) {
        this.logRequest(emailHash, "cooldown");
        return "cooldown";
      }

      const windowExpired =
        !claim.codeWindowStartedAt ||
        now.getTime() - claim.codeWindowStartedAt.getTime() >= CODE_WINDOW_MS;
      const sentCount = windowExpired ? 0 : claim.codeSentCount;
      if (sentCount >= LICENSE_CLAIM_MAX_CODES_PER_DAY) {
        this.logRequest(emailHash, "max_sends");
        return "max_sends";
      }

      const code = this.codes.generate();
      const codeExpiresAt = new Date(now.getTime() + LICENSE_CLAIM_CODE_TTL_MS);
      const status =
        claim.status === "issued" || claim.status === "issuing"
          ? claim.status
          : "code_sent";
      await this.prisma.licenseClaim.update({
        where: { id: claim.id },
        data: {
          status,
          codeHash: this.codes.hash(claim.id, code),
          codeExpiresAt,
          codeAttempts: 0,
          codeSentCount: sentCount + 1,
          codeWindowStartedAt: windowExpired
            ? now
            : claim.codeWindowStartedAt,
          lastCodeSentAt: now,
        },
      });

      try {
        const supportEmail =
          normalizeClaimEmail(this.env.LICENSE_NOTIFY_SUPPORT_EMAIL) ??
          undefined;
        await this.emailQueue.enqueue({
          workspaceId: null,
          action: {
            type: "LicenseClaim",
            id: claim.id,
            version: `code:${now.toISOString()}`,
          },
          envelope: {
            to: { address: email },
            template: "license_claim_code",
            data: {
              code,
              expiresAt: codeExpiresAt.toISOString(),
              productName: LICENSE_PRODUCT_NAME,
              ...(supportEmail ? { supportEmail } : {}),
            },
          },
        });
      } catch {
        this.logRequest(emailHash, "email_enqueue_failed", true);
        return "eligible";
      }

      this.logRequest(emailHash, "eligible");
      return "eligible";
    } catch {
      this.logRequest(emailHash, "internal_error", true);
      return "mysql_unavailable:query";
    }
  }

  async confirm(
    rawEmail: unknown,
    rawCode: unknown,
    now = new Date(),
  ): Promise<ClaimConfirmResult> {
    const email = normalizeClaimEmail(rawEmail);
    if (!email || typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode)) {
      this.logConfirm("none", "code_invalid");
      throwCodeInvalid();
    }

    let claim = await this.prisma.licenseClaim.findUnique({
      where: { emailNormalized: email },
    });
    if (
      !claim ||
      !claim.codeHash ||
      !claim.codeExpiresAt ||
      claim.codeExpiresAt.getTime() <= now.getTime() ||
      claim.codeAttempts >= LICENSE_CLAIM_MAX_CODE_ATTEMPTS
    ) {
      this.logConfirm(claim?.id ?? "none", "code_invalid");
      throwCodeInvalid();
    }

    if (!this.codes.verify(claim.id, rawCode, claim.codeHash)) {
      const nextAttempts = claim.codeAttempts + 1;
      await this.prisma.licenseClaim.update({
        where: { id: claim.id },
        data: {
          codeAttempts: { increment: 1 },
          ...(nextAttempts >= LICENSE_CLAIM_MAX_CODE_ATTEMPTS
            ? { codeHash: null, codeExpiresAt: null }
            : {}),
        },
      });
      this.logConfirm(claim.id, "code_invalid");
      throwCodeInvalid();
    }

    const statusBeforeCodeUse = claim.status;
    const updatedAtBeforeCodeUse = claim.updatedAt;
    const statusAfterCodeUse =
      statusBeforeCodeUse === "issued" || statusBeforeCodeUse === "issuing"
        ? statusBeforeCodeUse
        : "code_verified";
    const consumed = await this.prisma.licenseClaim.updateMany({
      where: {
        id: claim.id,
        codeHash: claim.codeHash,
        codeExpiresAt: { gt: now },
        codeAttempts: { lt: LICENSE_CLAIM_MAX_CODE_ATTEMPTS },
      },
      data: {
        codeHash: null,
        codeExpiresAt: null,
        codeAttempts: 0,
        status: statusAfterCodeUse,
      },
    });
    if (consumed.count !== 1) {
      const latest = await this.prisma.licenseClaim.findUnique({
        where: { id: claim.id },
      });
      if (latest?.status === "issued" && latest.licenseId) {
        return this.revealExisting(latest, latest.licenseId, email, now);
      }
      this.logConfirm(claim.id, "in_progress");
      throwClaimInProgress();
    }

    claim = await this.prisma.licenseClaim.findUnique({
      where: { id: claim.id },
    });
    if (!claim) {
      this.logConfirm("none", "in_progress");
      throwClaimInProgress();
    }

    if (claim.status === "issued") {
      if (!claim.licenseId) {
        return this.supportResult(claim.id);
      }
      return this.revealExisting(claim, claim.licenseId, email, now);
    }

    const existing = await this.findActiveLicense(email, now);
    if (existing) {
      claim = await this.markIssued(claim.id, existing.id, now);
      return this.revealExisting(claim, existing.id, email, now);
    }

    if (statusBeforeCodeUse === "issuing") {
      const recovered = await this.recoverStaleIssuing(
        claim,
        updatedAtBeforeCodeUse,
        email,
        now,
      );
      if (recovered) {
        return recovered;
      }
      claim = await this.prisma.licenseClaim.findUnique({
        where: { id: claim.id },
      });
      if (!claim) {
        this.logConfirm("none", "in_progress");
        throwClaimInProgress();
      }
    }

    const cas = await this.prisma.licenseClaim.updateMany({
      where: { id: claim.id, status: "code_verified" },
      data: { status: "issuing" },
    });
    if (cas.count !== 1) {
      const latest = await this.prisma.licenseClaim.findUnique({
        where: { id: claim.id },
      });
      if (latest?.status === "issued" && latest.licenseId) {
        return this.revealExisting(latest, latest.licenseId, email, now);
      }
      this.logConfirm(claim.id, "in_progress");
      throwClaimInProgress();
    }

    const config = readLicenseClaimConfig(this.env);
    const issued = await this.licensing.issueLicenseForPurchase({
      buyerEmail: email,
      buyerName: claim.buyerName,
      productSku: config.productSku,
      interval: config.interval,
      now,
    });

    if (!issued.created || !issued.rawKey) {
      const marked = await this.markIssued(claim.id, issued.license.id, now);
      return this.revealExisting(marked, issued.license.id, email, now);
    }

    const bound = await this.binding.bindIfNeeded(
      issued.license.id,
      email,
      this.prisma,
    );
    let emailDelivery: "queued" | "skipped" | "failed" = "failed";
    try {
      const notification = await this.notifications.notifyLicenseIssued({
        license: issued.license,
        rawKey: issued.rawKey,
        phoneE164: config.whatsappNotifyEnabled ? claim.phoneE164 : null,
        reason: "issue",
      });
      emailDelivery = notification.email;
    } catch {
      this.logger.warn(
        `license_claim_confirm_result claim=${claim.id} result=notify_failed license=${issued.license.id} keyPrefix=${issued.license.keyPrefix}`,
      );
    }

    await this.markIssued(claim.id, issued.license.id, now);
    this.logConfirm(
      claim.id,
      "issued",
      issued.license.id,
      issued.license.keyPrefix,
    );
    return {
      status: "issued",
      licenseKey: issued.rawKey,
      accountIdentity: bound.boundAccountEmail ?? email,
      keyPrefix: issued.license.keyPrefix,
      expiresAt: issued.license.expiresAt.toISOString(),
      emailDelivery,
    };
  }

  private async findActiveLicense(
    email: string,
    now: Date,
  ): Promise<License | null> {
    return this.prisma.license.findFirst({
      where: {
        buyerEmail: email,
        status: "active",
        expiresAt: { gt: now },
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    });
  }

  private async recoverStaleIssuing(
    claim: LicenseClaim,
    issuingUpdatedAt: Date,
    email: string,
    now: Date,
  ): Promise<ClaimConfirmResult | null> {
    if (
      now.getTime() - issuingUpdatedAt.getTime() <
      LICENSE_CLAIM_ISSUING_STALE_MS
    ) {
      this.logConfirm(claim.id, "in_progress");
      throwClaimInProgress();
    }

    const config = readLicenseClaimConfig(this.env);
    const issuedLicense = await this.prisma.license.findFirst({
      where: {
        buyerEmail: email,
        productSku: config.productSku,
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    });
    if (issuedLicense) {
      const marked = await this.markIssued(claim.id, issuedLicense.id, now);
      return this.revealExisting(marked, issuedLicense.id, email, now);
    }

    const reset = await this.prisma.licenseClaim.updateMany({
      where: { id: claim.id, status: "issuing" },
      data: { status: "code_verified" },
    });
    if (reset.count !== 1) {
      const latest = await this.prisma.licenseClaim.findUnique({
        where: { id: claim.id },
      });
      if (latest?.status === "issued" && latest.licenseId) {
        return this.revealExisting(latest, latest.licenseId, email, now);
      }
      this.logConfirm(claim.id, "in_progress");
      throwClaimInProgress();
    }
    return null;
  }

  private async markIssued(
    claimId: string,
    licenseId: string,
    now: Date,
  ): Promise<LicenseClaim> {
    return this.prisma.licenseClaim.update({
      where: { id: claimId },
      data: {
        status: "issued",
        licenseId,
        issuedAt: now,
        revealedAt: now,
        codeHash: null,
        codeExpiresAt: null,
        codeAttempts: 0,
      },
    });
  }

  private async revealExisting(
    claim: LicenseClaim,
    licenseId: string,
    email: string,
    now: Date,
  ): Promise<ClaimConfirmResult> {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });
    if (
      !license ||
      license.status !== "active" ||
      license.expiresAt.getTime() <= now.getTime()
    ) {
      return this.supportResult(claim.id, license ?? undefined);
    }

    const artifact = await this.prisma.licenseDeliveryArtifact.findUnique({
      where: { licenseId },
    });
    if (!artifact || artifact.expiresAt.getTime() <= now.getTime()) {
      return this.supportResult(claim.id, license);
    }

    let rawKey: string;
    try {
      rawKey = this.deliverySecrets.decrypt(licenseId, {
        ciphertext: artifact.ciphertext,
        iv: artifact.iv,
        authTag: artifact.authTag,
      });
    } catch {
      return this.supportResult(claim.id, license);
    }

    await this.prisma.licenseClaim.update({
      where: { id: claim.id },
      data: { revealedAt: now },
    });
    this.logConfirm(claim.id, "reveal_existing", license.id, license.keyPrefix);
    return {
      status: "issued",
      licenseKey: rawKey,
      accountIdentity: license.boundAccountEmail ?? email,
      keyPrefix: license.keyPrefix,
      expiresAt: license.expiresAt.toISOString(),
      emailDelivery: "not_resent",
    };
  }

  private supportResult(
    claimId: string,
    license?: Pick<License, "id" | "keyPrefix">,
  ): ClaimConfirmResult {
    this.logConfirm(
      claimId,
      "already_issued_contact_support",
      license?.id,
      license?.keyPrefix,
    );
    return { status: "already_issued_contact_support" };
  }

  private logRequest(
    emailHash: string,
    result: string,
    warning = false,
  ): void {
    const message = `license_claim_request_result emailHash=${emailHash} result=${result}`;
    if (warning) {
      this.logger.warn(message);
    } else {
      this.logger.log(message);
    }
  }

  private logConfirm(
    claimId: string,
    result: string,
    licenseId?: string,
    keyPrefix?: string,
  ): void {
    this.logger.log(
      `license_claim_confirm_result claim=${claimId} result=${result} license=${licenseId ?? "none"} keyPrefix=${keyPrefix ?? "none"}`,
    );
  }
}
