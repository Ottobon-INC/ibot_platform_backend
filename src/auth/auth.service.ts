import { Injectable, UnauthorizedException, Inject, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { OtpService } from './otp.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
  ) {}

  async sendOtp(email: string) {
    const loginIdentifierNormalized = email.toLowerCase().trim();

    // Generate and send OTP
    const otp = this.otpService.generateOtp(loginIdentifierNormalized);
    await this.emailService.sendVerificationEmail(loginIdentifierNormalized, otp);

    return { success: true, message: 'Verification email sent' };
  }

  async register(
    email: string, 
    passwordRaw: string, 
    firstName: string, 
    lastName: string,
    accountType?: string,
    organizationDetails?: any
  ) {
    const loginIdentifierNormalized = email.toLowerCase().trim();
    
    // Require email verification before registration
    if (!this.otpService.isVerified(loginIdentifierNormalized)) {
      throw new BadRequestException('Email has not been verified yet, or verification expired.');
    }

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
        displayName: `${firstName} ${lastName}`,
        authIdentities: {
          create: {
            providerType: 'LOCAL',
            providerName: 'Ottobon',
            loginIdentifierNormalized,
            passwordHash,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(), // Pre-verified!
          }
        }
      },
      include: {
        authIdentities: true
      }
    });

    if (accountType === 'ENTERPRISE' || accountType === 'ACADEMY') {
      const orgName = organizationDetails?.name || 'Unknown Organization';
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomBytes(4).toString('hex');
      const orgCode = 'ORG-' + randomBytes(4).toString('hex').toUpperCase();

      await this.db.workspace.create({
        data: {
          workspaceType: 'ORGANIZATION',
          displayName: orgName,
          ownerPersonId: person.id,
          status: 'PENDING',
          createdByPersonId: person.id,
          updatedByPersonId: person.id,
          memberships: {
            create: {
              personId: person.id,
              status: 'ACTIVE',
              joinedAt: new Date(),
              createdByPersonId: person.id,
              updatedByPersonId: person.id,
            }
          },
          organization: {
            create: {
              organizationType: accountType,
              organizationCode: orgCode,
              displayName: orgName,
              slug,
              status: 'PENDING_REVIEW',
              countryCode: organizationDetails?.country || 'US',
              timezone: 'UTC',
              createdByPersonId: person.id,
              updatedByPersonId: person.id,
            }
          }
        }
      });
    }

    return { success: true, personId: person.id };
  }

  async verifyEmail(email: string, code: string) {
    const loginIdentifierNormalized = email.toLowerCase().trim();
    
    const isValid = this.otpService.verifyOtp(loginIdentifierNormalized, code);
    if (!isValid) {
      throw new BadRequestException('That verification code is incorrect or expired. Try again.');
    }

    // OTP Service now flags the email as verified in memory for the next 15 mins.
    return { success: true };
  }

  async login(email: string, passwordRaw: string) {
    const loginIdentifierNormalized = email.toLowerCase().trim();
    
    const identity = await this.db.authIdentity.findUnique({
      where: { loginIdentifierNormalized },
      include: { 
        person: {
          include: {
            workspaceMemberships: {
              where: { status: 'ACTIVE' },
              include: {
                workspace: {
                  include: { organization: true }
                }
              }
            }
          }
        } 
      }
    });

    if (!identity || !identity.passwordHash) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const isMatch = await bcrypt.compare(passwordRaw, identity.passwordHash);
    
    if (!isMatch) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const workspaces = identity.person.workspaceMemberships.map(m => ({
      workspaceId: m.workspaceId,
      workspaceType: m.workspace.workspaceType,
      organizationId: m.workspace.organization?.id,
      organizationStatus: m.workspace.organization?.status,
      organizationName: m.workspace.organization?.displayName,
      organizationType: m.workspace.organization?.organizationType
    }));

    // Generate tokens
    const payload = { sub: identity.personId, authId: identity.id, workspaces };
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
      user: { 
        id: identity.personId, 
        email: identity.loginIdentifierNormalized,
        displayName: identity.person.displayName,
        workspaces
      }
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

