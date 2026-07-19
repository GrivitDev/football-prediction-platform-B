import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { Resend } from 'resend';

import { emailLayout } from './templates/email-layout';

import {
  sectionTitle,
  paragraph,
  warningBox,
  successBox,
  dangerBox,
  infoCard,
  primaryButton,
  secondaryButton,
} from './templates/email-components';
@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendOtpEmail(email: string, otp: string) {
    try {
      const response = await this.resend.emails.send({
        from: 'Honest Predict <register@honestpredict.com>',
        to: email,
        subject: 'Verify Your Email Address',
        html: `
<!DOCTYPE html>
<html>

<head>
<meta charset="UTF-8">
<title>Email Verification</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial,Helvetica,sans-serif;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="padding:40px 20px;"
>

<tr>

<td align="center">

<table
  width="600"
  cellpadding="0"
  cellspacing="0"
  style="
    background:#ffffff;
    border-radius:18px;
    overflow:hidden;
    box-shadow:0 8px 30px rgba(0,0,0,.08);
  "
>

<!-- Header -->

<tr>

<td
  align="center"
  style="
    background:#0f172a;
    padding:35px;
  "
>

<img
  src="https://www.honestpredict.com/logo1.png"
  alt="Honest Predict"
  width="90"
/>

</td>

</tr>

<!-- Banner -->

<tr>

<td>

<img
  src="https://www.honestpredict.com/images/football1.png"
  alt="Football Predictions"
  width="600"
  style="
    display:block;
    width:100%;
  "
/>

</td>

</tr>

<!-- Body -->

<tr>

<td style="padding:40px;">

<h2
  style="
    margin-top:0;
    color:#111827;
  "
>

Verify Your Email Address

</h2>

<p
  style="
    color:#4b5563;
    line-height:1.8;
    font-size:16px;
  "
>

Welcome to <strong>Honest Predict</strong>!

<br><br>

To complete your registration, please use the verification code below.

</p>

<div
  style="
    background:#eff6ff;
    border:2px dashed #2563eb;
    border-radius:12px;
    padding:25px;
    text-align:center;
    margin:35px 0;
  "
>

<p
  style="
    margin:0;
    color:#6b7280;
    font-size:14px;
    text-transform:uppercase;
    letter-spacing:2px;
  "
>

Verification Code

</p>

<div
  style="
    margin-top:15px;
    font-size:42px;
    font-weight:bold;
    letter-spacing:10px;
    color:#2563eb;
  "
>

${otp}

</div>

</div>

<p
  style="
    color:#6b7280;
    line-height:1.8;
  "
>

This verification code will expire in
<strong>5 minutes</strong>.

</p>

<p
  style="
    color:#6b7280;
    line-height:1.8;
  "
>

For your security, never share this code with anyone.

</p>

<hr
  style="
    border:none;
    border-top:1px solid #e5e7eb;
    margin:35px 0;
  "
>

<p
  style="
    color:#9ca3af;
    font-size:14px;
    line-height:1.8;
  "
>

If you didn't create an Honest Predict account,
you can safely ignore this email.

</p>

</td>

</tr>

<!-- Footer -->

<tr>

<td
  align="center"
  style="
    background:#f9fafb;
    padding:25px;
  "
>

<p
  style="
    margin:0;
    color:#6b7280;
    font-size:13px;
  "
>

© ${new Date().getFullYear()} Honest Predict

</p>

<p
  style="
    margin-top:10px;
  "
>

<a
  href="https://www.honestpredict.com"
  style="
    color:#2563eb;
    text-decoration:none;
  "
>

www.honestpredict.com

</a>

</p>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`,
      });

      return response;
    } catch (error) {
      console.error('Email sending error:', error);

      throw new InternalServerErrorException('Failed to send OTP email');
    }
  }

  async sendPasswordResetEmail(email: string, resetLink: string) {
    await this.resend.emails.send({
      from: 'Honest Predict <passwordreset@honestpredict.com>',
      to: email,
      subject: 'Reset Your Password',
      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Reset Password</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f4f7fb;
  font-family:Arial,Helvetica,sans-serif;
">

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="padding:40px 20px;"
>

<tr>

<td align="center">

<table
  width="600"
  cellpadding="0"
  cellspacing="0"
  style="
    background:#ffffff;
    border-radius:18px;
    overflow:hidden;
    box-shadow:0 8px 30px rgba(0,0,0,.08);
  "
>

<!-- Header -->

<tr>

<td
  align="center"
  style="
    background:#0f172a;
    padding:35px;
  "
>

<img
  src="https://www.honestpredict.com/logo1.png"
  alt="Honest Predict"
  width="90"
/>

</td>

</tr>

<!-- Banner -->

<tr>

<td>

<img
  src="https://www.honestpredict.com/images/football1.png"
  alt="Football"
  width="600"
  style="
    display:block;
    width:100%;
  "
/>

</td>

</tr>

<!-- Content -->

<tr>

<td style="padding:40px;">

<h2
  style="
    margin-top:0;
    color:#111827;
  "
>

Reset Your Password

</h2>

<p
  style="
    color:#4b5563;
    line-height:1.7;
    font-size:16px;
  "
>

Hello,

<br><br>

We received a request to reset the password for your Honest Predict account.

If this was you, simply click the button below.

</p>

<div
  style="
    text-align:center;
    margin:40px 0;
  "
>

<a
  href="${resetLink}"
  style="
    background:#2563eb;
    color:#ffffff;
    padding:16px 36px;
    text-decoration:none;
    border-radius:8px;
    font-weight:bold;
    font-size:16px;
    display:inline-block;
  "
>

Reset Password

</a>

</div>

<p
  style="
    color:#6b7280;
    line-height:1.7;
  "
>

This password reset link will expire in
<strong>30 minutes</strong>.

</p>

<p
  style="
    color:#6b7280;
    line-height:1.7;
  "
>

If the button doesn't work, copy and paste this link into your browser:

</p>

<p
  style="
    word-break:break-word;
  "
>

<a
  href="${resetLink}"
  style="
    color:#2563eb;
  "
>

${resetLink}

</a>

</p>

<hr
  style="
    border:none;
    border-top:1px solid #e5e7eb;
    margin:35px 0;
  "
>

<p
  style="
    color:#9ca3af;
    font-size:14px;
    line-height:1.7;
  "
>

If you didn't request a password reset,
you can safely ignore this email.
Your password will remain unchanged.

</p>

</td>

</tr>

<!-- Footer -->

<tr>

<td
  align="center"
  style="
    background:#f9fafb;
    padding:25px;
  "
>

<p
  style="
    margin:0;
    color:#6b7280;
    font-size:13px;
  "
>

© ${new Date().getFullYear()} Honest Predict

</p>

<p
  style="
    margin:10px 0 0;
  "
>

<a
  href="https://www.honestpredict.com"
  style="
    color:#2563eb;
    text-decoration:none;
  "
>

www.honestpredict.com

</a>

</p>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`,
    });
  }
  async sendPaymentReceivedEmail(data: {
    email: string;
    amount: number;
    paymentType: string;
    reference: string;
  }) {
    const homeUrl = 'https://www.honestpredict.com';

    const aboutUrl = 'https://www.honestpredict.com/about';

    return this.resend.emails.send({
      from: 'Honest Predict <payments@honestpredict.com>',

      to: data.email,

      subject: 'Payment Received Successfully',

      html: emailLayout({
        title: 'Payment Received',

        preheader:
          'Your payment has been received and is awaiting verification.',

        body: `
${sectionTitle('Payment Received')}

${paragraph(`
Hello,

Thank you for submitting your payment to Honest Predict.

Our finance team has successfully received your payment request and it is now awaiting verification.

Verification normally takes less than <strong>30 minutes</strong>.
As soon as your payment has been approved you will receive another confirmation email.
`)}

${warningBox(`
Your payment has been received successfully and is currently under review.
No further action is required from you at this time.
`)}

${infoCard('Payment Summary', [
  {
    label: 'Payment Type',
    value: data.paymentType,
  },
  {
    label: 'Amount',
    value: `₦${data.amount.toLocaleString()}`,
  },
  {
    label: 'Reference',
    value: data.reference,
  },
  {
    label: 'Status',
    value: 'Pending Verification',
  },
])}

${primaryButton('🏠 Go to Home', homeUrl)}

${secondaryButton('ℹ About Honest Predict', aboutUrl)}

${paragraph(`
Need help?

Our support team is always available if you have any questions regarding your payment.
`)}
`,
      }),
    });
  }

  async sendSubscriptionActivatedEmail(data: {
    email: string;
    plan: 'regular' | 'vip';
    amount: number;
    activatedDate: Date;
    expiryDate: Date;
  }) {
    const dashboardUrl = 'https://www.honestpredict.com/dashboard';

    const predictionsUrl = 'https://www.honestpredict.com/predictions';

    const planName =
      data.plan === 'vip' ? 'VIP Subscription' : 'Regular Subscription';

    return this.resend.emails.send({
      from: 'Honest Predict <subscriptions@honestpredict.com>',

      to: data.email,

      subject: `${planName} Activated Successfully`,

      html: emailLayout({
        title: 'Subscription Activated',

        preheader: 'Your subscription has been activated successfully.',

        body: `
${sectionTitle('🎉 Subscription Activated')}

${paragraph(`
Congratulations!

Your <strong>${planName}</strong> has been activated successfully.

Thank you for choosing Honest Predict.
`)}

${successBox(`
Your subscription is now active.

You can immediately enjoy all the features available on your selected plan.
`)}

${infoCard('Subscription Summary', [
  {
    label: 'Plan',
    value: planName,
  },
  {
    label: 'Status',
    value: '🟢 Active',
  },
  {
    label: 'Amount Paid',
    value: `₦${data.amount.toLocaleString()}`,
  },
  {
    label: 'Activated',
    value: data.activatedDate.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  },
  {
    label: 'Expires',
    value: data.expiryDate.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  },
])}

${
  data.plan === 'vip'
    ? `
${infoCard('VIP Benefits', [
  {
    label: '✓ Premium Predictions',
    value: '',
  },
  {
    label: '✓ VIP Markets',
    value: '',
  },
  {
    label: '✓ Expert Analysis',
    value: '',
  },
  {
    label: '✓ Early Access',
    value: '',
  },
])}
`
    : `
${infoCard('Regular Benefits', [
  {
    label: '✓ Regular Predictions',
    value: '',
  },
  {
    label: '✓ Member Features',
    value: '',
  },
  {
    label: '✓ Daily Tips',
    value: '',
  },
])}
`
}

${primaryButton('📊 Go to Dashboard', dashboardUrl)}

${secondaryButton('⚽ Browse Predictions', predictionsUrl)}

${paragraph(`
Thank you for trusting Honest Predict.

We wish you success with your football predictions!
`)}
`,
      }),
    });
  }

  async sendPaymentRejectedEmail(data: {
    email: string;
    paymentType: string;
    amount: number;
    reason?: string;
  }) {
    const paymentUrl = 'https://www.honestpredict.com/payments';

    const supportUrl = 'https://www.honestpredict.com/about';

    return this.resend.emails.send({
      from: 'Honest Predict <payments@honestpredict.com>',

      to: data.email,

      subject: 'Your Payment Could Not Be Verified',

      html: emailLayout({
        title: 'Payment Rejected',

        preheader: 'Your payment verification was unsuccessful.',

        body: `
${sectionTitle('Payment Verification Unsuccessful')}

${paragraph(`
Hello,

Unfortunately, we were unable to verify your recent payment submission.

This does not necessarily mean your payment failed. In many cases, payments are rejected because the uploaded proof is unclear, the transfer details cannot be verified, or there is missing information.
`)}

${dangerBox(`
Your payment request has been rejected.

Reason:
<strong>${data.reason || 'No reason was provided by the administrator.'}</strong>
`)}

${infoCard('Payment Details', [
  {
    label: 'Payment Type',
    value: data.paymentType,
  },
  {
    label: 'Amount',
    value: `₦${data.amount.toLocaleString()}`,
  },
  {
    label: 'Status',
    value: 'Rejected',
  },
])}

${paragraph(`
You can submit another payment request after correcting the issue mentioned above.

If you believe this decision was made in error, please contact our support team and include your payment details.
`)}

${primaryButton('Submit Another Payment', paymentUrl)}

${secondaryButton('About Honest Predict', supportUrl)}

${paragraph(`
Thank you for your patience and understanding.

We appreciate your continued support of Honest Predict.
`)}
`,
      }),
    });
  }

  async sendWelcomeEmail(data: { email: string; fullName: string }) {
    const dashboardUrl = 'https://www.honestpredict.com/dashboard';

    const predictionsUrl = 'https://www.honestpredict.com/predictions';

    const vipUrl = 'https://www.honestpredict.com/subscription';

    return this.resend.emails.send({
      from: 'Honest Predict <welcome@honestpredict.com>',

      to: data.email,

      subject: 'Welcome to Honest Predict 🎉',

      html: emailLayout({
        title: 'Welcome to Honest Predict',

        preheader: 'Your account has been verified successfully.',

        body: `
${sectionTitle('Welcome to Honest Predict! ⚽')}

${paragraph(`
Hello <strong>${data.fullName}</strong>,

Congratulations! Your account has been verified successfully, and you're now officially part of the Honest Predict community.

We're excited to have you with us and look forward to helping you make smarter football prediction decisions.
`)}

${successBox(`
Your account is now fully verified and ready to use.

You can start exploring today's predictions immediately.
`)}

${infoCard('Your Account', [
  {
    label: 'Status',
    value: 'Verified',
  },
  {
    label: 'Membership',
    value: 'Free',
  },
  {
    label: 'Access',
    value: 'Active',
  },
])}

${paragraph(`
As a member of Honest Predict, you can:

• View free football predictions

• Purchase premium predictions individually

• Upgrade to a Regular or VIP subscription

• Access expert football analysis

• Receive timely match insights
`)}

${primaryButton('Go to Dashboard', dashboardUrl)}

${secondaryButton('Browse Predictions', predictionsUrl)}

${secondaryButton('Upgrade to VIP', vipUrl)}

${paragraph(`
Thank you for choosing Honest Predict.

We wish you success and hope you enjoy everything our platform has to offer.
`)}
`,
      }),
    });
  }

  async sendSubscriptionExpiringEmail(data: {
    email: string;
    plan: 'regular' | 'vip';
    expiryDate: Date;
    daysRemaining: number;
  }) {
    const renewalUrl = 'https://www.honestpredict.com/subscription';

    const dashboardUrl = 'https://www.honestpredict.com/dashboard';

    return this.resend.emails.send({
      from: 'Honest Predict <subscriptions@honestpredict.com>',

      to: data.email,

      subject: `Your ${data.plan.toUpperCase()} Subscription Expires Soon`,

      html: emailLayout({
        title: 'Subscription Expiring Soon',

        preheader: 'Your subscription will expire soon.',

        body: `
${sectionTitle('Your Subscription is Almost Expiring ⏳')}

${paragraph(`
Hello,

Your <strong>${data.plan.toUpperCase()}</strong> subscription will expire soon.

To continue enjoying uninterrupted access to premium football predictions and member benefits, please renew your subscription before it expires.
`)}

${warningBox(`
Your subscription expires in <strong>${data.daysRemaining} day${
  data.daysRemaining === 1 ? '' : 's'
}</strong>.
`)}

${infoCard('Subscription Details', [
  {
    label: 'Plan',
    value: data.plan.toUpperCase(),
  },
  {
    label: 'Expires On',
    value: data.expiryDate.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  },
  {
    label: 'Days Remaining',
    value: `${data.daysRemaining}`,
  },
])}

${paragraph(`
Renewing before your subscription expires ensures you continue enjoying uninterrupted access to all your current benefits.
`)}

${primaryButton('Renew Subscription', renewalUrl)}

${secondaryButton('Go to Dashboard', dashboardUrl)}

${paragraph(`
Thank you for choosing Honest Predict.

We appreciate your continued support.
`)}
`,
      }),
    });
  }

  async sendSubscriptionExpiredEmail(data: {
    email: string;
    plan: 'regular' | 'vip';
    expiryDate: Date;
  }) {
    const renewalUrl = 'https://www.honestpredict.com/subscription';

    const predictionsUrl = 'https://www.honestpredict.com/predictions';

    return this.resend.emails.send({
      from: 'Honest Predict <subscriptions@honestpredict.com>',

      to: data.email,

      subject: 'Your Subscription Has Expired',

      html: emailLayout({
        title: 'Subscription Expired',

        preheader: 'Your subscription has expired.',

        body: `
${sectionTitle('Your Subscription Has Expired')}

${paragraph(`
Hello,

Your <strong>${data.plan.toUpperCase()}</strong> subscription has now expired.

Premium features are no longer available until your subscription is renewed.
`)}

${dangerBox(`
Your subscription expired on <strong>${data.expiryDate.toLocaleDateString(
  'en-NG',
  {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
)}</strong>.
`)}

${infoCard('Subscription Summary', [
  {
    label: 'Plan',
    value: data.plan.toUpperCase(),
  },
  {
    label: 'Status',
    value: 'Expired',
  },
  {
    label: 'Expired On',
    value: data.expiryDate.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  },
])}

${paragraph(`
Renew today to regain immediate access to premium football predictions, expert analysis, and exclusive member content.
`)}

${primaryButton('Renew Subscription', renewalUrl)}

${secondaryButton('Browse Free Predictions', predictionsUrl)}

${paragraph(`
We hope to welcome you back soon.

Thank you for being part of Honest Predict.
`)}
`,
      }),
    });
  }
}
