import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { LicenseRateLimitService } from "../../licensing/license-rate-limit.service";
import { LicensingModule } from "../../licensing/licensing.module";
import { IntegrationsModule } from "../integrations.module";
import { NodApiAuthGuard, NodApiHealthAuthGuard } from "./nod-api-auth.guard";
import { NodApiController } from "./nod-api.controller";
import { NodApiService } from "./nod-api.service";

// NodApiModule keeps its own LicenseRateLimitService instance rather than
// having LicensingModule export its singleton — buckets are keyed by route
// name ("nod-api" vs "activate"/"heartbeat"/...), so a separate in-memory
// counter is behaviorally equivalent and avoids widening LicensingModule's
// public surface for a single new consumer.
@Module({
  imports: [PrismaModule, IntegrationsModule, LicensingModule],
  controllers: [NodApiController],
  providers: [
    NodApiService,
    NodApiAuthGuard,
    NodApiHealthAuthGuard,
    LicenseRateLimitService,
  ],
})
export class NodApiModule {}
