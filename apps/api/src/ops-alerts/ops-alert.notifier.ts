import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";

/** Best-effort sender used only for operational notifications. */
@Injectable()
export class OpsAlertNotifier {
  private readonly logger = new Logger(OpsAlertNotifier.name);

  constructor(
    @Optional() @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv = process.env,
  ) {}

  async sendText(phone: string, message: string): Promise<boolean> {
    const baseUrl = (this.env.OPS_ALERT_UAZAPI_BASE_URL ?? this.env.LICENSE_NOTIFY_UAZAPI_BASE_URL)?.trim();
    const token = (this.env.OPS_ALERT_UAZAPI_TOKEN ?? this.env.LICENSE_NOTIFY_UAZAPI_TOKEN)?.trim();
    const number = phone.replace(/\D/g, "");
    if (!baseUrl || !token || !number) return false;

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/send/text`, {
        method: "POST",
        headers: { "content-type": "application/json", token },
        body: JSON.stringify({ number, text: message }),
      });
      return response.ok;
    } catch {
      this.logger.warn("ops_alert_whatsapp_send_failed");
      return false;
    }
  }
}
