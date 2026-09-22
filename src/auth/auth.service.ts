import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async login(email: string, password: string) {
    if (email.trim().toLowerCase() === 'test@ottobon.com' && password === 'password123') {
      return { 
        accessToken: 'mock.access.token', 
        refreshToken: 'mock.refresh.token',
        user: { id: 'mock-person-id', displayName: 'Test User' } 
      };
    }
    throw new UnauthorizedException('Email or password is incorrect.');
  }

  async refreshSession(refreshToken: string) {
    if (refreshToken === 'mock.refresh.token') {
      return { 
        newAccessToken: 'mock.access.token.refreshed', 
        newRefreshToken: 'mock.refresh.token.2' 
      };
    }
    throw new UnauthorizedException('Session expired or invalid');
  }
}
