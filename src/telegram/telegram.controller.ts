import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  // Optional: later for webhook integrations
  @Post('webhook')
  handleWebhook(@Body() body: any) {
    return {
      received: true,
      data: body,
    };
  }
}
