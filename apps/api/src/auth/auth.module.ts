import { Module } from "@nestjs/common";
import { PrismaModule } from "../common/prisma/prisma.module";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

@Module({
  imports: [PrismaModule],
  providers: [AuthService, PasswordService],
  exports: [AuthService, PasswordService]
})
export class AuthModule {}
