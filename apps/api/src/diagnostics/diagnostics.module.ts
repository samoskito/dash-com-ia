import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../common/prisma/prisma.module";
import { QueueModule } from "../common/queue/queue.module";
import { DiagnosticsController } from "./diagnostics.controller";
import { DiagnosticsService } from "./diagnostics.service";

@Module({
  imports: [AuthModule, PrismaModule, QueueModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
  exports: [DiagnosticsService]
})
export class DiagnosticsModule {}
