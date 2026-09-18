import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { EmailQueueService } from "../email/email-queue.service";
import { OpsAlertNotifier } from "../ops-alerts/ops-alert.notifier";
import { INDIVIDUAL_NUMBER_PRICE_CENTS } from "./package-billing.policy";
import { PackageBillingConfiguration } from "./package-billing.configuration";
import { BillingTrialReminderTemplateService } from "./billing-trial-reminder-template.service";

export type BillingTrialReminderMoment = "d3" | "day_of" | "post";

@Injectable()
export class BillingTrialReminderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BillingTrialReminderTemplateService)
    private readonly templates: BillingTrialReminderTemplateService,
    @Inject(PackageBillingConfiguration)
    private readonly configuration: PackageBillingConfiguration,
    @Inject(EmailQueueService) private readonly emailQueue: EmailQueueService,
    @Inject(OpsAlertNotifier) private readonly notifier: OpsAlertNotifier,
  ) {}

  /** Claim before external delivery so repeated job executions cannot duplicate a send. */
  async sendOnce(
    subscriptionId: string,
    moment: BillingTrialReminderMoment,
  ): Promise<boolean> {
    const subscription = await this.prisma.workspaceSubscription.findUnique({
      where: { id: subscriptionId },
      select: { workspaceId: true },
    });
    if (!subscription) return false;

    let delivery: { id: string };
    try {
      delivery = await this.prisma.billingTrialReminderDelivery.create({
        data: { workspaceId: subscription.workspaceId, subscriptionId, moment },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }

    const [template, trial] = await Promise.all([
      this.templates.list().then((items) => items.find((item) => item.moment === moment)),
      this.prisma.workspaceSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          workspace: {
            select: {
              name: true,
              members: {
                where: { role: "owner" },
                take: 1,
                select: { user: { select: { email: true, name: true } } },
              },
              opsAlertSettings: { select: { alertPhonesE164: true } },
            },
          },
          whatsappSeats: {
            where: { status: { in: ["reserved", "active", "suspended"] } },
            select: { id: true },
          },
        },
      }),
    ]);
    if (!template || !trial?.trialEndsAt) return false;

    const rendered = this.render(template.body, template.emailSubject, {
      cliente: trial.workspace.name,
      data_fim: new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
      }).format(trial.trialEndsAt),
      valor:
        trial.whatsappSeats.length === 0
          ? "—"
          : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
              (trial.whatsappSeats.length * INDIVIDUAL_NUMBER_PRICE_CENTS) / 100,
            ),
      numeros: String(trial.whatsappSeats.length),
      link_assinatura: this.configuration.checkoutSuccessUrl() ?? "#",
    });
    const owner = trial.workspace.members[0]?.user;
    const emailStatus = await this.sendEmail(
      delivery.id,
      trial.workspaceId,
      subscriptionId,
      moment,
      owner,
      rendered,
    );
    const whatsappStatus = await this.sendWhatsapp(
      trial.workspace.opsAlertSettings?.alertPhonesE164 ?? [],
      `${rendered.subject}\n\n${rendered.body}`,
    );
    await this.prisma.billingTrialReminderDelivery.update({
      where: { id: delivery.id },
      data: { emailStatus, whatsappStatus },
    });
    return true;
  }

  private render(body: string, subject: string, values: Record<string, string>) {
    const replace = (value: string) => value.replace(/{{(cliente|data_fim|valor|numeros|link_assinatura)}}/g, (_, key: string) => values[key]);
    return { body: replace(body), subject: replace(subject) };
  }

  private async sendEmail(
    deliveryId: string,
    workspaceId: string,
    subscriptionId: string,
    moment: BillingTrialReminderMoment,
    owner: { email: string; name: string | null } | undefined,
    rendered: { body: string; subject: string },
  ): Promise<string> {
    if (!owner || !this.emailQueue.isEnabled()) {
      await this.prisma.billingContractAudit.create({
        data: {
          workspaceId,
          subscriptionId,
          actorType: "system",
          action: "trial.reminder_email_skipped",
          reason: owner ? "Email transacional desabilitado" : "Workspace sem proprietário com email",
        },
      });
      return "skipped";
    }
    try {
      await this.emailQueue.enqueue({
        workspaceId,
        action: { type: "BillingTrialReminder", id: deliveryId, version: moment },
        envelope: {
          to: { address: owner.email, name: owner.name ?? undefined },
          template: "billing_trial_reminder",
          data: { recipientName: owner.name ?? undefined, emailSubject: rendered.subject, body: rendered.body, subscriptionUrl: this.configuration.checkoutSuccessUrl() ?? "#" },
        },
      });
      return "queued";
    } catch {
      return "failed";
    }
  }

  private async sendWhatsapp(phones: string[], message: string): Promise<string> {
    if (phones.length === 0) return "skipped";
    const sent = await Promise.all(phones.map((phone) => this.notifier.sendText(phone, message)));
    return sent.some(Boolean) ? "sent" : "failed";
  }
}
