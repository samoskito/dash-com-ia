import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  workspaceOpsAlertSettingsSchema,
  type WorkspaceOpsAlertSettingsInput,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { WhatsappConnectionsService } from "../integrations/whatsapp-connections.service";
import { OpsAlertNotifier } from "./ops-alert.notifier";

type ScanResult = { checked: number; notified: number; skipped: number };

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
    const settings = await this.prisma.workspaceOpsAlertSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        enabled: input.enabled,
        alertPhoneE164: input.alertPhone || null,
        disconnectAlerts: input.disconnectAlerts,
        webhookSilenceAlerts: input.webhookSilenceAlerts,
        silenceThresholdHours: input.silenceThresholdHours,
        debounceHours: input.debounceHours,
      },
      update: {
        enabled: input.enabled,
        alertPhoneE164: input.alertPhone || null,
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
            createdAt: settings.createdAt.toISOString(),
            updatedAt: settings.updatedAt.toISOString(),
          }
        : {
            id: null,
            workspaceId,
            enabled: false,
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
      where: { enabled: true, alertPhoneE164: { not: null } },
      include: { workspace: { select: { name: true } }, },
    });

    for (const setting of settings) {
      if (!setting.alertPhoneE164) continue;
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
        try {
          const status = await this.whatsappConnections.getStatus(setting.workspaceId, instance.id);
          if (status.connectionStatus === "disconnected") {
            await this.notify(setting, `disconnect:${instance.id}`, `[WppTrack] WhatsApp desconectado no workspace "${setting.workspace.name}" (instancia "${instance.name}"). Reconecte no painel.`, result, now);
          }
        } catch (error) {
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

  private async notify(setting: { workspaceId: string; alertPhoneE164: string | null; debounceHours: number }, alertKey: string, message: string, result: ScanResult, now: Date) {
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
    const sent = await this.notifier.sendText(setting.alertPhoneE164 ?? "", message);
    await this.record(setting.workspaceId, alertKey, sent ? "sent" : "failed", sent ? null : "notify_failed");
    if (sent) result.notified += 1;
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
