import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Every NOD API broker rejection uses this shape — { statusCode, code, message }
 * — matching the convention used by LicensingService / LicenseRateLimitService
 * so public-template clients can branch on a stable machine-readable `code`.
 */
export function throwNodApiError(
  status: HttpStatus,
  code: string,
  message: string,
): never {
  throw new HttpException({ statusCode: status, code, message }, status);
}
