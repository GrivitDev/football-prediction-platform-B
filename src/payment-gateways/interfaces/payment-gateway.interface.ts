export interface InitializePaymentInput {
  email: string;

  amount: number;

  reference: string;

  callbackUrl: string;
}

export interface InitializePaymentResult {
  authorizationUrl: string;

  accessCode?: string;

  reference: string;
}

export interface VerifyPaymentResult {
  success: boolean;

  transactionId: string;

  message?: string;

  raw: Record<string, any>;
}

export interface WebhookEvent {
  reference: string;

  transactionId: string;

  status: 'success' | 'failed';

  raw: Record<string, any>;
}

export interface PaymentGateway {
  /**
   * Create a payment session.
   */
  initializePayment(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult>;

  /**
   * Verify payment by our internal reference.
   */
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;

  /**
   * Validate webhook signature.
   */
  validateWebhook(payload: any, signature?: string): Promise<boolean>;

  /**
   * Convert the provider's webhook payload
   * into a common application event.
   */
  parseWebhook(payload: any): Promise<WebhookEvent>;
}
