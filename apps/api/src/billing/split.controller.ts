import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post
} from "@nestjs/common";
import {
  splitReceiverCreateInputSchema,
  splitReceiverUpdateInputSchema
} from "@wpptrack/shared";
import { SplitService } from "./split.service";

@Controller("backoffice/split")
export class SplitController {
  constructor(@Inject(SplitService) private readonly splitService: SplitService) {}

  @Get("receivers")
  listReceivers() {
    return this.splitService.listReceivers();
  }

  @Post("receivers")
  createReceiver(@Body() body: unknown) {
    const parsed = splitReceiverCreateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.splitService.createReceiver(parsed.data);
  }

  @Patch("receivers/:id")
  updateReceiver(@Param("id") receiverId: string, @Body() body: unknown) {
    const parsed = splitReceiverUpdateInputSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException("Payload invalido");
    }

    return this.splitService.updateReceiver(receiverId, parsed.data);
  }
}
