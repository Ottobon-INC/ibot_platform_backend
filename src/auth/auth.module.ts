import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../email/email.module';
import { OtpService } from './otp.service';

@Module({
  imports: [
    EmailModule,
    JwtModule.register({
      global: true,
      secret: 'my-jwt-secret', // In production, use environment variable
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OtpService],
  exports: [AuthService],
})
export class AuthModule {}
