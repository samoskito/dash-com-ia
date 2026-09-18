import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";

/**
 * Minimal Uazapi text sender for license delivery WhatsApp notifications.
 * Best-effort only: any failure is swallowed by the caller.
 */
@Injectable()
export class LicenseWhatsappNotifier {
  private readonly logger = new Logger(LicenseWhatsappNotifier.name);

  constructor(
    @Optional()
    @Inject(RUNTIME_ENV)
    private readonly env: RuntimeEnv = process.env,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.env.LICENSE_NOTIFY_UAZAPI_BASE_URL?.trim() &&
        this.env.LICENSE_NOTIFY_UAZAPI_TOKEN?.trim(),
    );
  }

  async sendLicenseKey(phone: string, message: string): Promise<boolean> {
    const baseUrl = this.env.LICENSE_NOTIFY_UAZAPI_BASE_URL?.trim();
    const token = this.env.LICENSE_NOTIFY_UAZAPI_TOKEN?.trim();
    if (!baseUrl || !token) {
      this.logger.warn("license_notify_whatsapp_send_failed reason=not_configured");
      return false;
    }
    const digits = phone.replace(/\D/g, "");
    if (!digits) {
      this.logger.warn("license_notify_whatsapp_send_failed reason=empty_phone");
      return false;
    }
    try {
      const response = await fetch(`${baseUrl}/send/text`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          token,
        },
        body: JSON.stringify({ number: digits, text: message }),
      });
      if (!response.ok) {
        this.logger.warn(
          `license_notify_whatsapp_send_failed reason=http_not_ok status=${response.status}`,
        );
      }
      return response.ok;
    } catch {
      this.logger.warn("license_notify_whatsapp_send_failed reason=network");
      return false;
    }
  }
}
