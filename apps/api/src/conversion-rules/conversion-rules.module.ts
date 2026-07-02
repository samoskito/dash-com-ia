import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { ConversionRulesController } from "./conversion-rules.controller";
import { ConversionRulesService } from "./conversion-rules.service";

@Module({
  imports: [AuthModule, PrismaModule, WorkspacesModule],
  controllers: [ConversionRulesController],
  providers: [ConversionRulesService],
  exports: [ConversionRulesService]
})
export class ConversionRulesModule {}
