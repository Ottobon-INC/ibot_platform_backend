import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    // If SMTP_HOST is not set, we create a dummy transport that just logs the email.
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', 
      auth: {
        user: process.env.SMTP_USER || 'dummy',
        pass: process.env.SMTP_PASS || 'dummy',
      },
    });
  }

  async sendVerificationEmail(to: string, otp: string) {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"OTTOBON" <noreply@ottobon.com>',
      to,
      subject: 'Verify your email address - OTTOBON',
      text: `Your verification code is: ${otp}\n\nThis code will expire shortly.`,
      html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; text-align: center;">
              <h2>Verify your email</h2>
              <p>Thanks for signing up for OTTOBON! Your verification code is:</p>
              <h1 style="font-size: 32px; letter-spacing: 4px; color: #1a1a1a;">${otp}</h1>
              <p>If you didn't request this, you can safely ignore this email.</p>
             </div>`,
    };

    try {
      if (process.env.SMTP_HOST) {
        const info = await this.transporter.sendMail(mailOptions);
        this.logger.log(`Email sent to ${to}: ${info.messageId}`);
      } else {
        // Fallback for development without SMTP set up
        this.logger.warn(`SMTP_HOST not set. Fake email sent to ${to} with OTP: ${otp}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      // In production you might want to throw or handle gracefully.
    }
  }
}
