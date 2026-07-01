import { Module } from "@nestjs/common";
import { PrismaService } from "./common/prisma/prisma.service";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";

@Module({
  controllers: [HealthController, MockController],
  providers: [MockService, PrismaService]
})
export class AppModule {}
