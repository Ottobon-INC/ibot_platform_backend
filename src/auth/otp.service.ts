import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  
  // In a real production app, use Redis or a Database table for OTPs.
  // For now, we store them in memory.
  private readonly otps = new Map<string, { code: string; expiresAt: number; verified?: boolean }>();

  generateOtp(email: string): string {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    this.otps.set(email.toLowerCase(), { code, expiresAt });
    this.logger.log(`Generated OTP for ${email}`);
    
    return code;
  }

  verifyOtp(email: string, code: string): boolean {
    const normalizedEmail = email.toLowerCase();
    const record = this.otps.get(normalizedEmail);

    if (!record) {
      return false; // No OTP generated for this email
    }

    if (Date.now() > record.expiresAt) {
      this.otps.delete(normalizedEmail);
      return false; // OTP expired
    }

    if (record.code === code) {
      // Mark as verified but keep the record for a few minutes for registration
      record.verified = true;
      record.expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins to complete registration
      this.logger.log(`Verified OTP for ${email}`);
      return true;
    }

    return false; // Incorrect code
  }

  isVerified(email: string): boolean {
    const normalizedEmail = email.toLowerCase();
    const record = this.otps.get(normalizedEmail);

    if (record && record.verified && Date.now() < record.expiresAt) {
      // Burn after registration use
      this.otps.delete(normalizedEmail);
      return true;
    }

    return false;
  }
}
