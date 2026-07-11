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
  platformUserProvisionInputSchema,
  platformUserRoleUpdateInputSchema
} from "@wpptrack/shared";
import { AuthToken } from "./auth-user.decorator";
import { AuthService } from "./auth.service";
import { PlatformAdminService } from "./platform-admin.service";

@Controller("backoffice/platform-users")
export class BackofficePlatformUsersController {
  constructor(
    @Inject(PlatformAdminService)
    private readonly platformAdminService: PlatformAdminService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Get()
  async list(@AuthToken() refreshToken: string) {
    await this.platformAdminService.assertPlatformOwner(refreshToken);
    return this.authService.listPlatformUsers();
  }

  @Post()
  async provision(@AuthToken() refreshToken: string, @Body() body: unknown) {
    const owner = await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = platformUserProvisionInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.authService.provisionPlatformUser(parsed.data, owner.id);
  }

  @Patch(":userId")
  async updateRole(
    @AuthToken() refreshToken: string,
    @Param("userId") userId: string,
    @Body() body: unknown
  ) {
    const owner = await this.platformAdminService.assertPlatformOwner(refreshToken);
    const parsed = platformUserRoleUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.authService.updatePlatformUserRole(
      userId,
      parsed.data,
      owner.id
    );
  }
}
