import { Controller, Post, Body, Res, Req, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Request, Response } from 'express';

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any, @Res({ passthrough: true }) response: Response) {
    // In a real implementation, we validate email/password using DTOs
    const { email, password } = body;
    
    const { accessToken, refreshToken } = await this.authService.login(email, password);

    // In a real implementation with @fastify/cookie, we would set a secure HttpOnly cookie here:
    // response.setCookie('ottobon_refresh_token', refreshToken, { ... })

    return { accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies['ottobon_refresh_token'];
    
    if (!refreshToken) {
      response.status(HttpStatus.UNAUTHORIZED).send({ message: 'No refresh token found' });
      return;
    }

    // In a real implementation with @fastify/cookie, we would set a secure HttpOnly cookie here:
    // response.setCookie('ottobon_refresh_token', newRefreshToken, { ... })

    return { accessToken: newAccessToken };
  }
}
