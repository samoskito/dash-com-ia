import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, PlatformAdminService],
  exports: [AuthService, PasswordService, PlatformAdminService]
})
export class AuthModule {}
