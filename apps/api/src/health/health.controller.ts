import { Controller, Get, HttpStatus, Inject, Res } from "@nestjs/common";
import { HealthService } from "./health.service";

type HealthResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => unknown;
  };
};

@Controller("health")
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  async getReadiness(@Res() response: HealthResponse) {
    const readiness = await this.healthService.getReadiness();
    const statusCode =
      readiness.status === "ok" ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return response.status(statusCode).json(readiness);
  }
}
