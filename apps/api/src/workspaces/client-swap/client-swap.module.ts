import { Module } from '@nestjs/common';
import { ClientSwapService } from './client-swap.service';
import { ClientSwapController } from './client-swap.controller';
import { ClientSwapRateLimitService } from './client-swap-rate-limit.service';
import { AuthService } from '../../auth/auth.service';
import { PasswordService } from '../../auth/password.service';

@Module({
  controllers: [ClientSwapController],
  providers: [
    ClientSwapService,
    ClientSwapRateLimitService,
    AuthService,
    PasswordService,
  ],
  exports: [ClientSwapService, ClientSwapRateLimitService],
})
export class ClientSwapModule {}