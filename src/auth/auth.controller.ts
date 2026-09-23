import { Controller, Post, Body, Res, Req, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    // In a real implementation, use DTOs
    const { email, password, firstName, lastName } = body;
    return this.authService.register(email, password, firstName, lastName);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any, @Res({ passthrough: true }) response: FastifyReply) {
    const { email, password } = body;
    
    const { accessToken, refreshToken, user } = await this.authService.login(email, password);

    response.setCookie('ottobon_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/v1/auth', // Important: limit where the cookie is sent
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return { accessToken, user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const refreshToken = request.cookies['ottobon_refresh_token'];
    
    if (!refreshToken) {
      response.status(HttpStatus.UNAUTHORIZED).send({ message: 'No refresh token found' });
      return;
    }

    const { newAccessToken, newRefreshToken } = await this.authService.refreshSession(refreshToken);

    response.setCookie('ottobon_refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { accessToken: newAccessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: FastifyReply) {
    response.clearCookie('ottobon_refresh_token', { path: '/v1/auth' });
    return { success: true };
  }
}
