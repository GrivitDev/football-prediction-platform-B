import { Injectable } from '@nestjs/common';
import { TelegramService } from '../telegram.service';

@Injectable()
export class AdsHandler {
  constructor(private telegram: TelegramService) {}
}
