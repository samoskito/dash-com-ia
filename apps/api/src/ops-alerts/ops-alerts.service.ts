import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  workspaceOpsAlertSettingsSchema,
  type WorkspaceOpsAlertSettingsInput,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { WhatsappConnectionsService } from "../integrations/whatsapp-connections.service";
import { OpsAlertNotifier } from "./ops-alert.notifier";

type ScanResult = { checked: number; notified: number; skipped: number };

type DisconnectObservation = "disconnected" | "connected" | "ambiguous";

/** Consecutive disconnected observations required before a disconnect alert is sent. */
const DISCONNECT_CONFIRMATIONS = 2;

/** Provider status texts that mean the session is really gone, not merely idle or unreachable. */
const DEFINITIVE_DISCONNECT_STATUSES = new Set(["disconnected", "closed", "logged_out", "loggedout"]);

const DISCONNECT_OBSERVED_DETAIL = "disconnect_observed streak=";
const CONNECTED_OBSERVED_DETAIL = "connected_observed";

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsappConnectionsService) private readonly whatsappConnections: WhatsappConnectionsService,
    @Inject(OpsAlertNotifier) private readonly notifier: OpsAlertNotifier,
  ) {}

  async getSettings(workspaceId: string) {
    const settings = await this.prisma.workspaceOpsAlertSettings.findUnique({
      where: { workspaceId },
    });
    return this.toSettingsResponse(workspaceId, settings);
  }

  async upsertSettings(workspaceId: string, input: WorkspaceOpsAlertSettingsInput, _actorUserId: string) {
    const alertPhonesE164 = [...new Set(input.alertPhones.map((phone) => phone.replace(/\D/g, "")).filter(Boolean))].slice(0, 10);
    const alertPhoneE164 = alertPhonesE164[0] ?? null;
    const settings = await this.prisma.workspaceOpsAlertSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        enabled: input.enabled,
        alertPhonesE164,
        alertPhoneE164,
        disconnectAlerts: input.disconnectAlerts,
        webhookSilenceAlerts: input.webhookSilenceAlerts,
        silenceThresholdHours: input.silenceThresholdHours,
        debounceHours: input.debounceHours,
      },
      update: {
        enabled: input.enabled,
        alertPhonesE164,
        alertPhoneE164,
        disconnectAlerts: input.disconnectAlerts,
        webhookSilenceAlerts: input.webhookSilenceAlerts,
        silenceThresholdHours: input.silenceThresholdHours,
        debounceHours: input.debounceHours,
      },
    });
    return this.toSettingsResponse(workspaceId, settings);
  }

  private toSettingsResponse(
    workspaceId: string,
    settings: {
      id: string;
      workspaceId: string;
      enabled: boolean;
      alertPhonesE164: string[];
      alertPhoneE164: string | null;
      disconnectAlerts: boolean;
      webhookSilenceAlerts: boolean;
      silenceThresholdHours: number;
      debounceHours: number;
      createdAt: Date;
      updatedAt: Date;
    } | null,
  ) {
    return workspaceOpsAlertSettingsSchema.parse(
      settings
        ? {
            ...settings,
            alertPhoneE164: settings.alertPhonesE164[0] ?? null,
            createdAt: settings.createdAt.toISOString(),
            updatedAt: settings.updatedAt.toISOString(),
          }
        : {
            id: null,
            workspaceId,
            enabled: false,
            alertPhonesE164: [],
            alertPhoneE164: null,
            disconnectAlerts: true,
            webhookSilenceAlerts: true,
            silenceThresholdHours: 24,
            debounceHours: 6,
            createdAt: null,
            updatedAt: null,
          },
    );
  }

  async runScan(now = new Date()): Promise<ScanResult> {
    const result: ScanResult = { checked: 0, notified: 0, skipped: 0 };
    const settings = await this.prisma.workspaceOpsAlertSettings.findMany({
      where: { enabled: true, alertPhonesE164: { isEmpty: false } },
      include: { workspace: { select: { name: true } }, },
    });

    for (const setting of settings) {
      if (setting.alertPhonesE164.length === 0) continue;
      const instances = await this.prisma.whatsappInstance.findMany({
        where: { workspaceId: setting.workspaceId, status: "active", provider: "uazapi", providerTokenEncrypted: { not: null } },
        select: { id: true, name: true },
      });
      for (const instance of instances) {
        result.checked += 1;
        if (!setting.disconnectAlerts) {
          result.skipped += 1;
          await this.record(setting.workspaceId, `disconnect:${instance.id}`, "skipped", "disconnect_alert_disabled");
          continue;
        }
        const alertKey = `disconnect:${instance.id}`;
        try {
          const status = await this.whatsappConnections.getStatus(setting.workspaceId, instance.id);
          const observation = this.classifyDisconnect(status);
          if (observation === "connected") {
            await this.clearDisconnectStreak(setting.workspaceId, alertKey);
            continue;
          }
          // Transient or unknown states (pending, qr_required, error, hibernated, offline) are never
          // enough on their own: they neither alert nor break a streak of confirmed disconnects.
          if (observation === "ambiguous") continue;
          const streak = (await this.readDisconnectStreak(setting.workspaceId, alertKey)) + 1;
          if (streak < DISCONNECT_CONFIRMATIONS) {
            result.skipped += 1;
            await this.record(setting.workspaceId, alertKey, "skipped", `${DISCONNECT_OBSERVED_DETAIL}${streak}`);
            continue;
          }
          await this.notify(setting, alertKey, `[WppTrack] WhatsApp desconectado no workspace "${setting.workspace.name}" (instancia "${instance.name}"). Reconecte no painel.`, result, now);
        } catch (error) {
          // A failing status check is not evidence of a disconnect, so it never alerts.
          this.logger.warn(`ops_alert_disconnect_status_failed workspace=${setting.workspaceId} instance=${instance.id}`);
        }
      }

      const connections = await this.prisma.inboundWebhookConnection.findMany({
        where: { workspaceId: setting.workspaceId, removedAt: null, status: { in: ["production", "observation"] } },
        select: { id: true, displayName: true, status: true, createdAt: true, lastDeliveryAt: true },
      });
      for (const connection of connections) {
        result.checked += 1;
        const lastAt = connection.lastDeliveryAt;
        const thresholdAt = new Date(now.getTime() - setting.silenceThresholdHours * 3_600_000);
        const isSilent = lastAt ? lastAt < thresholdAt : connection.createdAt < thresholdAt;
        // Observation connections are relevant only after receiving at least one webhook.
        if (!isSilent || (connection.status === "observation" && !lastAt)) continue;
        if (!setting.webhookSilenceAlerts) {
          result.skipped += 1;
          await this.record(setting.workspaceId, `silence:${connection.id}`, "skipped", "silence_alert_disabled");
          continue;
        }
        const reference = lastAt ?? connection.createdAt;
        const hours = Math.max(1, Math.floor((now.getTime() - reference.getTime()) / 3_600_000));
        await this.notify(setting, `silence:${connection.id}`, `[WppTrack] Sem webhook ha ${hours}h no workspace "${setting.workspace.name}" (conexao "${connection.displayName}"). Verifique o provedor.`, result, now);
      }
    }
    return result;
  }

  private classifyDisconnect(status: { connectionStatus: string; providerStatusText?: string | null }): DisconnectObservation {
    if (status.connectionStatus === "connected") return "connected";
    if (status.connectionStatus !== "disconnected") return "ambiguous";
    const providerStatusText = status.providerStatusText?.trim().toLowerCase();
    if (providerStatusText && !DEFINITIVE_DISCONNECT_STATUSES.has(providerStatusText)) return "ambiguous";
    return "disconnected";
  }

  /**
   * Consecutive disconnect observations are tracked on the delivery rows themselves: the latest row
   * for the alert key carries the streak, and any other outcome (sent, connected, debounced) resets it.
   */
  private async readDisconnectStreak(workspaceId: string, alertKey: string): Promise<number> {
    const last = await this.prisma.workspaceOpsAlertDelivery.findFirst({
      where: { workspaceId, alertKey },
      orderBy: { createdAt: "desc" },
      select: { detail: true },
    });
    const detail = last?.detail ?? "";
    if (!detail.startsWith(DISCONNECT_OBSERVED_DETAIL)) return 0;
    const streak = Number.parseInt(detail.slice(DISCONNECT_OBSERVED_DETAIL.length), 10);
    return Number.isFinite(streak) && streak > 0 ? streak : 0;
  }

  private async clearDisconnectStreak(workspaceId: string, alertKey: string): Promise<void> {
    const streak = await this.readDisconnectStreak(workspaceId, alertKey);
    if (streak === 0) return;
    await this.record(workspaceId, alertKey, "skipped", CONNECTED_OBSERVED_DETAIL);
  }

  private async notify(setting: { workspaceId: string; alertPhonesE164: string[]; debounceHours: number }, alertKey: string, message: string, result: ScanResult, now: Date) {
    const after = new Date(now.getTime() - setting.debounceHours * 3_600_000);
    const recent = await this.prisma.workspaceOpsAlertDelivery.findFirst({
      where: { workspaceId: setting.workspaceId, alertKey, status: "sent", createdAt: { gte: after } },
      orderBy: { createdAt: "desc" },
    });
    if (recent) {
      result.skipped += 1;
      await this.record(setting.workspaceId, alertKey, "skipped", "debounced");
      return;
    }
    const outcomes = await Promise.all(
      setting.alertPhonesE164.map(async (phone) => {
        try {
          return await this.notifier.sendText(phone, message);
        } catch {
          return false;
        }
      }),
    );
    const sent = outcomes.filter(Boolean).length;
    const failed = outcomes.length - sent;
    await this.record(
      setting.workspaceId,
      alertKey,
      sent > 0 ? "sent" : "failed",
      `sent=${sent} failed=${failed}`,
    );
    if (sent > 0) result.notified += 1;
    else result.skipped += 1;
  }

  private async record(workspaceId: string, alertKey: string, status: "sent" | "skipped" | "failed", detail: string | null) {
    try {
      await this.prisma.workspaceOpsAlertDelivery.create({ data: { workspaceId, alertKey, channel: "whatsapp", status, detail } });
    } catch {
      this.logger.warn(`ops_alert_delivery_record_failed workspace=${workspaceId}`);
    }
  }
}
