import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async getPendingOrganizations() {
    const orgs = await this.db.organization.findMany({
      where: {
        status: 'PENDING_REVIEW'
      },
      include: {
        workspace: {
          include: {
            memberships: {
              where: {
                status: 'ACTIVE'
              },
              include: {
                person: {
                  include: {
                    authIdentities: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Map to a friendlier format for the frontend review queue
    return orgs.map(org => {
      // Find the owner (first active membership person)
      const owner = org.workspace?.memberships?.[0]?.person;
      const email = owner?.authIdentities?.[0]?.loginIdentifierNormalized;

      return {
        id: org.id,
        name: org.displayName,
        location: org.countryCode, // Could map this to full country name on FE
        type: org.organizationType,
        owner: owner?.displayName || 'Unknown',
        email: email || 'Unknown',
        submitted: org.createdAt,
        status: org.status === 'PENDING_REVIEW' ? 'Needs Review' : org.status,
      };
    });
  }

  async getOrganizationDetail(id: string) {
    const org = await this.db.organization.findUnique({
      where: { id },
      include: {
        workspace: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: {
                person: {
                  include: {
                    authIdentities: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const owner = org.workspace?.memberships?.[0]?.person;
    const email = owner?.authIdentities?.[0]?.loginIdentifierNormalized;

    return {
      id: org.id,
      name: org.displayName,
      legalName: org.legalName || org.displayName,
      type: org.organizationType,
      country: org.countryCode,
      status: org.status,
      submitted: org.createdAt,
      owner: {
        name: owner?.displayName,
        email: email
      }
    };
  }

  async approveOrganization(id: string, adminPersonId: string = '00000000-0000-0000-0000-000000000000') {
    // In a real system, adminPersonId comes from the auth token
    const org = await this.db.organization.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvedAt: new Date(),
        // Note: Prisma might throw if adminPersonId is not a valid UUID in the Person table if we have a strict FK,
        // but since approvedByPersonId is optional and might be null, we will omit it for this mock unless it's a real user.
        // For simplicity we just set status and approvedAt.
      }
    });

    await this.db.workspace.update({
      where: { id: org.workspaceId },
      data: {
        status: 'ACTIVE'
      }
    });

    return { success: true, organization: org };
  }

  async rejectOrganization(id: string) {
    const org = await this.db.organization.update({
      where: { id },
      data: {
        status: 'REJECTED',
      }
    });

    await this.db.workspace.update({
      where: { id: org.workspaceId },
      data: {
        status: 'REJECTED'
      }
    });

    return { success: true, organization: org };
  }
}
