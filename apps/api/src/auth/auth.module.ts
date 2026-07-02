import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

@Module({
  providers: [AuthService, PasswordService, PrismaService],
  exports: [AuthService, PasswordService]
})
export class AuthModule {}
