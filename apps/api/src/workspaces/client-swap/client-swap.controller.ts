import { Controller, Post, Body, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ClientSwapService } from './client-swap.service';
import { ClientSwapDto, ClientSwapResult } from '@wpptrack/shared';
import { WorkspaceOwnerGuard } from '../guards/workspace-owner.guard';
import { IdempotencyGuard } from '../../common/guards/idempotency.guard';

@Controller('workspaces')
@UseGuards(IdempotencyGuard)
export class ClientSwapController {
  constructor(private readonly clientSwapService: ClientSwapService) {}

  @Post(':workspaceId/client-swap')
  @UseGuards(WorkspaceOwnerGuard)
  @HttpCode(HttpStatus.OK)
  async swap(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ClientSwapDto,
    @Req() req: any,
  ): Promise<ClientSwapResult> {
    const actorUserId = req.user.id;
    const idempotencyKey = req.idempotencyKey;
    return this.clientSwapService.swap(workspaceId, actorUserId, dto, idempotencyKey);
  }
}