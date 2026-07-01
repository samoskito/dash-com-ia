import { Module } from "@nestjs/common";
import { PrismaService } from "./common/prisma/prisma.service";
import { QueueModule } from "./common/queue/queue.module";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";

@Module({
  imports: [QueueModule],
  controllers: [HealthController, MockController],
  providers: [MockService, PrismaService]
})
export class AppModule {}
