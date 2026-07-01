import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";

@Module({
  controllers: [HealthController, MockController],
  providers: [MockService]
})
export class AppModule {}
