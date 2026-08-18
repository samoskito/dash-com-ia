import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { clientSwapDto, type ClientSwapResult } from "@wpptrack/shared";
import { IdempotencyGuard } from "../../common/guards/idempotency.guard";
import { WorkspaceOwnerGuard } from "../guards/workspace-owner.guard";
import { ClientSwapService } from "./client-swap.service";

@Controller("workspaces")
export class ClientSwapController {
  constructor(
    @Inject(ClientSwapService)
    private readonly clientSwapService: ClientSwapService,
  ) {}

  @Post(":workspaceId/client-swap")
  @UseGuards(WorkspaceOwnerGuard, IdempotencyGuard)
  @HttpCode(HttpStatus.OK)
  async swap(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Req() req: { user: { id: string }; idempotencyKey: string },
  ): Promise<ClientSwapResult> {
    const parsed = clientSwapDto.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.clientSwapService.swap(
      workspaceId,
      req.user.id,
      parsed.data,
      req.idempotencyKey,
    );
  }
}
