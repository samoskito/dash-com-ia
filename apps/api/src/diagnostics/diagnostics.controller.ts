import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";
import {
  diagnosticEventCreateSchema,
  diagnosticEventListQuerySchema
} from "@wpptrack/shared";
import { DiagnosticsService } from "./diagnostics.service";

@Controller("backoffice/diagnostics")
export class DiagnosticsController {
  constructor(
    @Inject(DiagnosticsService)
    private readonly diagnosticsService: DiagnosticsService
  ) {}

  @Get("events")
  listEvents(@Query() query: Record<string, unknown>) {
    const parsed = diagnosticEventListQuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException("Filtros invalidos");
    }

    return this.diagnosticsService.listEvents(parsed.data);
  }

  @Get("events/:id")
  getEvent(@Param("id") id: string) {
    return this.diagnosticsService.getEvent(id);
  }

  @Post("events")
  recordEvent(@Body() body: unknown) {
    const parsed = diagnosticEventCreateSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.diagnosticsService.recordEvent(parsed.data);
  }
}
