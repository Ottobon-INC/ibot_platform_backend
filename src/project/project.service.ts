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
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
