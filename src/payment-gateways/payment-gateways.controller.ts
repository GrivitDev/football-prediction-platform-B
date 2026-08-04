import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

import { PaymentGatewaysService } from './payment-gateways.service';

@Controller('payment-gateways')
export class PaymentGatewaysController {
  constructor(
    private readonly paymentGatewaysService: PaymentGatewaysService,
  ) {}

  // =====================================================
  // INITIALIZE PAYMENT
  //
  // User must be authenticated to create a payment.
  // =====================================================
  @UseGuards(JwtAuthGuard)
  @Post('initialize')
  initializePayment(
    @GetUser() user: any,
    @Body()
    body: {
      gateway: 'paystack' | 'opay';
      type: 'subscription' | 'prediction' | 'vip_upgrade';
      target: string;
    },
  ) {
    return this.paymentGatewaysService.initializePayment({
      userId: user._id,

      email: user.email,

      gateway: body.gateway,

      type: body.type,

      target: body.target,
    });
  }

  // =====================================================
  // VERIFY PAYMENT
  //
  // No JWT required.
  //
  // The payment reference is used to identify and verify
  // the transaction directly with the payment gateway.
  //
  // Frontend callback page
  //        ↓
  // Verify with gateway
  //        ↓
  // Approve payment
  //        ↓
  // Activate subscription / prediction
  // =====================================================
  @Get(':gateway/verify')
  verifyPayment(
    @Param('gateway')
    gateway: 'paystack' | 'opay',

    @Query('reference')
    reference: string,
  ) {
    return this.paymentGatewaysService.verifyPayment(
      gateway,

      reference,
    );
  }

  // =====================================================
  // PAYSTACK WEBHOOK
  //
  // Public endpoint.
  //
  // Paystack calls this endpoint directly.
  // Signature validation is handled by the service.
  // =====================================================
  @Post('paystack/webhook')
  paystackWebhook(
    @Req() req: any,

    @Headers('x-paystack-signature')
    signature: string,
  ) {
    return this.paymentGatewaysService.handleWebhook(
      'paystack',

      req.body,

      signature,
    );
  }

  // =====================================================
  // OPAY WEBHOOK
  //
  // Public endpoint.
  //
  // OPay calls this endpoint directly.
  // Signature validation is handled by the service.
  // =====================================================
  @Post('opay/webhook')
  opayWebhook(
    @Req() req: any,

    @Headers('authorization')
    signature: string,
  ) {
    return this.paymentGatewaysService.handleWebhook(
      'opay',

      req.body,

      signature,
    );
  }
}
