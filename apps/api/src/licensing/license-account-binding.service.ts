import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { License } from "@prisma/client";

export type LicenseBindingRecord = Pick<
  License,
  "id" | "boundAccountEmail" | "boundAccountId" | "boundAt"
>;

export type LicenseBindingClient = {
  license: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<License | null>;
    updateMany: (args: {
      where: {
        id: string;
        boundAccountEmail: null;
        boundAccountId: null;
      };
      data: {
        boundAccountEmail?: string;
        boundAccountId?: string;
        boundAt: Date;
      };
    }) => Promise<{ count: number }>;
  };
};

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function boundIdentity(license: LicenseBindingRecord): string | null {
  return license.boundAccountEmail ?? license.boundAccountId ?? null;
}

@Injectable()
export class LicenseAccountBindingService {
  normalizeAccountIdentity(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          code: "license_invalid_request",
          message: "accountIdentity is required",
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return looksLikeEmail(trimmed) ? trimmed.toLowerCase() : trimmed;
  }

  assertCanActivate(
    license: LicenseBindingRecord,
    accountIdentity: string,
  ): string {
    const normalized = this.normalizeAccountIdentity(accountIdentity);
    const bound = boundIdentity(license);
    if (bound && bound !== normalized) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          code: "license_account_mismatch",
          message: "Esta licença já está vinculada a outra conta.",
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return normalized;
  }

  async bindIfNeeded(
    licenseId: string,
    accountIdentity: string,
    prisma: LicenseBindingClient,
  ): Promise<License> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
    });
    if (!license) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: "license_invalid",
          message: "Licença inválida.",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const normalized = this.assertCanActivate(license, accountIdentity);
    if (boundIdentity(license)) {
      return license;
    }

    await prisma.license.updateMany({
      where: {
        id: licenseId,
        boundAccountEmail: null,
        boundAccountId: null,
      },
      data: looksLikeEmail(normalized)
        ? { boundAccountEmail: normalized, boundAt: new Date() }
        : { boundAccountId: normalized, boundAt: new Date() },
    });

    const latest = await prisma.license.findUnique({
      where: { id: licenseId },
    });
    if (!latest) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          code: "license_invalid",
          message: "Licença inválida.",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertCanActivate(latest, normalized);
    return latest;
  }
}
