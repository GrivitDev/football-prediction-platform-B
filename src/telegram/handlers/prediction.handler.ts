import { Injectable } from '@nestjs/common';
import { TelegramService } from '../telegram.service';

@Injectable()
export class PredictionHandler {
  constructor(private telegram: TelegramService) {}

  async onPredictionCreated(prediction: any) {}
}
