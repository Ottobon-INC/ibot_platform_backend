import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private jwtService: JwtService
  ) {}

  async register(email: string, passwordRaw: string, firstName: string, lastName: string) {
    const loginIdentifierNormalized = email.toLowerCase().trim();
    
    // Check if user already exists
    const existing = await this.db.authIdentity.findUnique({
      where: { loginIdentifierNormalized }
    });
    
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(passwordRaw, 10);

    // Create Person and AuthIdentity
    const person = await this.db.person.create({
      data: {
        status: 'ACTIVE',
        authIdentities: {
          create: {
            providerType: 'LOCAL',
            providerName: 'Ottobon',
            loginIdentifierNormalized,
            passwordHash,
            status: 'ACTIVE',
          }
        }
      },
      include: {
        authIdentities: true
      }
    });

    return { success: true, personId: person.id };
  }

  async login(email: string, passwordRaw: string) {
    const loginIdentifierNormalized = email.toLowerCase().trim();
    
    const identity = await this.db.authIdentity.findUnique({
      where: { loginIdentifierNormalized },
      include: { person: true }
    });

    if (!identity || !identity.passwordHash) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const isMatch = await bcrypt.compare(passwordRaw, identity.passwordHash);
    
    if (!isMatch) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    // Generate tokens
    const payload = { sub: identity.personId, authId: identity.id };
    const accessToken = await this.jwtService.signAsync(payload);
    
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    // Create session in DB
    await this.db.authSession.create({
      data: {
        authIdentityId: identity.id,
        personId: identity.personId,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });

    return { 
      accessToken, 
      refreshToken,
      user: { id: identity.personId, email: identity.loginIdentifierNormalized }
    };
  }

  async refreshSession(refreshToken: string) {
    // Basic mock implementation for now
    if (!refreshToken) throw new UnauthorizedException('Session expired');
    return { 
      newAccessToken: 'mock.access.token.refreshed', 
      newRefreshToken: 'mock.refresh.token.2' 
    };
  }
}

