import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { NodApiAuthGuard, NodApiHealthAuthGuard } from "./nod-api-auth.guard";
import { throwNodApiError } from "./nod-api.errors";
import { NodApiService } from "./nod-api.service";
import type { NodApiAuthContext } from "./nod-api.types";

type NodApiHttpRequest = {
  nodApiAuth?: NodApiAuthContext;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireInstanceCredential(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throwNodApiError(
      HttpStatus.BAD_REQUEST,
      "nod_api_invalid_request",
      `${field} is required`,
    );
  }
  return value;
}

@Controller("nod-api")
export class NodApiController {
  constructor(@Inject(NodApiService) private readonly nodApi: NodApiService) {}

  @Get("health")
  @UseGuards(NodApiHealthAuthGuard)
  async health(@Req() req: NodApiHttpRequest) {
    return this.nodApi.health(req.nodApiAuth!.license);
  }

  @Post("instances")
  @HttpCode(200)
  @UseGuards(NodApiAuthGuard)
  async createInstance(
    @Body() body: { name?: unknown },
    @Req() req: NodApiHttpRequest,
  ) {
    return this.nodApi.createInstance(
      req.nodApiAuth!.license,
      optionalText(body?.name),
    );
  }

  @Post("instances/status")
  @HttpCode(200)
  @UseGuards(NodApiAuthGuard)
  async instanceStatus(
    @Body() body: { instanceId?: unknown; instanceToken?: unknown },
    @Req() _req: NodApiHttpRequest,
  ) {
    const instanceId = requireInstanceCredential(body?.instanceId, "instanceId");
    const instanceToken = requireInstanceCredential(
      body?.instanceToken,
      "instanceToken",
    );
    return this.nodApi.instanceStatus(instanceId, instanceToken);
  }
}
