import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post
} from "@nestjs/common";
import {
  splitReceiverCreateInputSchema,
  splitReceiverUpdateInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "../auth/auth-user.decorator";
import { PlatformAdminService } from "../auth/platform-admin.service";
import { SplitService } from "./split.service";

@Controller("backoffice/split")
export class SplitController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(SplitService) private readonly splitService: SplitService
  ) {}

  @Get("receivers")
  async listReceivers(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    return this.splitService.listReceivers();
  }

  @Post("receivers")
  async createReceiver(@AuthToken() refreshToken: string, @Body() body: unknown) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = splitReceiverCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.splitService.createReceiver(parsed.data);
  }

  @Patch("receivers/:id")
  async updateReceiver(
    @AuthToken() refreshToken: string,
    @Param("id") receiverId: string,
    @Body() body: unknown
  ) {
    await this.platformAdminService.assertPlatformAdmin(refreshToken);

    const parsed = splitReceiverUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.splitService.updateReceiver(receiverId, parsed.data);
  }
}
