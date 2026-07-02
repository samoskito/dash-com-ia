import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { QueueModule } from "./common/queue/queue.module";
import { HealthController } from "./health/health.controller";
import { MockController } from "./mock/mock.controller";
import { MockService } from "./mock/mock.service";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [QueueModule, AuthModule, WorkspacesModule],
  controllers: [HealthController, MockController],
  providers: [MockService]
})
export class AppModule {}
