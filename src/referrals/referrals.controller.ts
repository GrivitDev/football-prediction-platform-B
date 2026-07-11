import { Controller, Get } from '@nestjs/common';

import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Get('test')
  test() {
    return {
      message: 'Referral module working',
    };
  }
}
