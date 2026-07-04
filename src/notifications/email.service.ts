import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendOtpEmail(email: string, otp: string) {
    try {
      const response = await this.resend.emails.send({
        from: 'Football Prediction <onboarding@resend.dev>',

        to: email,

        subject: 'Verify Your Account',

        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Email Verification</h2>

              <p>Your OTP code is:</p>

              <div
                style="
                  font-size: 32px;
                  font-weight: bold;
                  letter-spacing: 5px;
                  margin: 20px 0;
                "
              >
                ${otp}
              </div>

              <p>
                This code expires in 5 minutes.
              </p>

              <p>
                If you did not request this,
                please ignore this email.
              </p>
            </div>
          `,
      });

      return response;
    } catch (error) {
      console.error('Email sending error:', error);

      throw new InternalServerErrorException('Failed to send OTP email');
    }
  }
  async sendPasswordResetEmail(email: string, link: string) {
    await this.resend.emails.send({
      from: 'Football Prediction <onboarding@resend.dev>',
      to: email,
      subject: 'Reset Your Password',
      html: `
      <p>Click below to reset your password:</p>
      <a href="${link}">${link}</a>
    `,
    });
  }
}
