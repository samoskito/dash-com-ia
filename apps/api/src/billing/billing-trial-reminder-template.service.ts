import { Inject, Injectable } from "@nestjs/common";
import {
  billingTrialReminderMoments,
  type BillingTrialReminderTemplateDto,
  type BillingTrialReminderTemplatesInputDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";

const DEFAULT_TEMPLATES: Array<{
  moment: string;
  body: string;
  emailSubject: string;
}> = [
  {
    moment: "d3",
    emailSubject: "Seu período de teste termina em {{data_fim}}",
    body: "Olá, {{cliente}}!\n\nSeu período de teste termina em {{data_fim}}. Você está usando {{numeros}} número(s), no valor mensal de {{valor}}.\n\nAssine para continuar: {{link_assinatura}}",
  },
  {
    moment: "day_of",
    emailSubject: "Hoje termina o período de teste de {{cliente}}",
    body: "Olá, {{cliente}}!\n\nSeu período de teste termina hoje ({{data_fim}}). Você está usando {{numeros}} número(s), no valor mensal de {{valor}}.\n\nConclua sua assinatura: {{link_assinatura}}",
  },
  {
    moment: "post",
    emailSubject: "Seu acesso está no período de graça",
    body: "Olá, {{cliente}}!\n\nSeu período de graça começou. Você está usando {{numeros}} número(s), no valor mensal de {{valor}}.\n\nRegularize sua assinatura: {{link_assinatura}}",
  },
];

@Injectable()
export class BillingTrialReminderTemplateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<BillingTrialReminderTemplateDto[]> {
    const count = await this.prisma.billingTrialReminderTemplate.count();
    if (count === 0) {
      await this.prisma.billingTrialReminderTemplate.createMany({
        data: DEFAULT_TEMPLATES,
        skipDuplicates: true,
      });
    }
    const templates = await this.prisma.billingTrialReminderTemplate.findMany({
      orderBy: { moment: "asc" },
    });
    return billingTrialReminderMoments.flatMap((moment) => {
      const template = templates.find((item) => item.moment === moment);
      return template
        ? [{ moment: moment as BillingTrialReminderTemplateDto["moment"], body: template.body, emailSubject: template.emailSubject }]
        : [];
    });
  }

  async replace(
    input: BillingTrialReminderTemplatesInputDto,
  ): Promise<BillingTrialReminderTemplateDto[]> {
    await this.prisma.$transaction(
      input.templates.map((template) =>
        this.prisma.billingTrialReminderTemplate.upsert({
          where: { moment: template.moment },
          create: template,
          update: { body: template.body, emailSubject: template.emailSubject },
        }),
      ),
    );
    return this.list();
  }
}
