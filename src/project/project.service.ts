import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ProjectService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  async getDashboardMetrics(orgId: string) {
    let targetOrgId = orgId;
    if (!targetOrgId || targetOrgId === 'default') {
      const firstOrg = await this.db.organization.findFirst({
        where: { status: 'ACTIVE' }
      });
      if (!firstOrg) {
        return { projects: 0, activeRuns: 0, teamMembers: 0, actionsRequired: 0 };
      }
      targetOrgId = firstOrg.id;
    }

    const projectsCount = await this.db.project.count({
      where: { organizationId: targetOrgId }
    });

    const activeRunsCount = await this.db.projectRun.count({
      where: { 
        project: { organizationId: targetOrgId },
        status: 'ACTIVE'
      }
    });

    return {
      projects: projectsCount,
      activeRuns: activeRunsCount,
      teamMembers: 1, 
      actionsRequired: 0 
    };
  }

  async listProjects(orgId: string) {
    let targetOrgId = orgId;
    if (!targetOrgId || targetOrgId === 'default') {
      const firstOrg = await this.db.organization.findFirst({
        where: { status: 'ACTIVE' }
      });
      if (!firstOrg) return [];
      targetOrgId = firstOrg.id;
    }

    return this.db.project.findMany({
      where: { organizationId: targetOrgId },
      include: {
        runs: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async listRuns(orgId: string) {
    let targetOrgId = orgId;
    if (!targetOrgId || targetOrgId === 'default') {
      const firstOrg = await this.db.organization.findFirst({
        where: { status: 'ACTIVE' }
      });
      if (!firstOrg) return [];
      targetOrgId = firstOrg.id;
    }

    return this.db.projectRun.findMany({
      where: {
        project: {
          organizationId: targetOrgId
        }
      },
      include: {
        project: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
  }

  async createProject(data: { orgId: string, name: string, description?: string }) {
    let targetOrgId = data.orgId;
    if (!targetOrgId || targetOrgId === 'default') {
      const firstOrg = await this.db.organization.findFirst({
        where: { status: 'ACTIVE' }
      });
      if (!firstOrg) throw new BadRequestException("No active organization found");
      targetOrgId = firstOrg.id;
    }

    const code = data.name.substring(0, 3).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    return this.db.project.create({
      data: {
        organizationId: targetOrgId,
        projectCode: code,
        canonicalName: data.name,
        description: data.description || '',
        status: 'ACTIVE',
        visibility: 'PRIVATE'
      }
    });
  }

  async getProjectDetails(projectId: string) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      include: {
        runs: {
          include: {
            runPhases: true,
            setupVersions: true
          },
          orderBy: { createdAt: 'desc' }
        },
        projectAssignments: {
          include: {
            person: true
          }
        }
      }
    });

    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async createProjectRun(projectId: string, data: {
    displayName: string,
    description?: string,
    targetParticipantCount?: number,
    plannedStartAt?: Date,
    plannedEndAt?: Date
  }) {
    const project = await this.db.project.findUnique({
      where: { id: projectId }
    });

    if (!project) throw new NotFoundException("Project not found");

    const count = await this.db.projectRun.count({
      where: { projectId }
    });

    const sequenceNo = count + 1;
    const runCode = `${project.projectCode}-R${sequenceNo}`;

    return this.db.projectRun.create({
      data: {
        organizationId: project.organizationId,
        projectId: project.id,
        runCode,
        displayName: data.displayName,
        description: data.description || '',
        sequenceNo,
        status: 'ACTIVE',
        visibility: 'PRIVATE',
        targetParticipantCount: data.targetParticipantCount || 50,
        plannedStartAt: data.plannedStartAt,
        plannedEndAt: data.plannedEndAt,
        actualStartAt: new Date(),
        
        // Create initial Setup Version (v1)
        setupVersions: {
          create: {
            organizationId: project.organizationId,
            versionNo: 1,
            status: 'APPROVED',
            entryPolicyJson: { allowSelfEnrollment: false, allowInvitation: true },
            participantFieldSchemaJson: { fields: ['firstName', 'lastName', 'email', 'phone'] }
          }
        },

        // Create default Journey Phases (IDENTIFY -> BUILD -> OPERATE -> TRANSFER)
        runPhases: {
          create: [
            {
              organizationId: project.organizationId,
              phaseType: 'IDENTIFY',
              sequenceNo: 1,
              status: 'ACTIVE',
              ownershipType: 'ORGANIZATION'
            },
            {
              organizationId: project.organizationId,
              phaseType: 'BUILD',
              sequenceNo: 2,
              status: 'NOT_STARTED',
              ownershipType: 'OTTOBON'
            },
            {
              organizationId: project.organizationId,
              phaseType: 'OPERATE',
              sequenceNo: 3,
              status: 'NOT_STARTED',
              ownershipType: 'SHARED'
            },
            {
              organizationId: project.organizationId,
              phaseType: 'TRANSFER',
              sequenceNo: 4,
              status: 'NOT_STARTED',
              ownershipType: 'ORGANIZATION'
            }
          ]
        }
      },
      include: {
        setupVersions: true,
        runPhases: true
      }
    });
  }
}
