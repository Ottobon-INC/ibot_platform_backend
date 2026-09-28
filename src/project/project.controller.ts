import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectService } from './project.service';
// In a full implementation, we'd use AuthGuard to extract the user's workspace
// import { AuthGuard } from '../auth/auth.guard'; 

@Controller('v1/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get('dashboard-metrics')
  async getDashboardMetrics(@Query('orgId') orgId: string) {
    return this.projectService.getDashboardMetrics(orgId);
  }

  @Get()
  async listProjects(@Query('orgId') orgId: string) {
    return this.projectService.listProjects(orgId);
  }

  @Post()
  async createProject(@Body() body: { orgId: string, name: string, description?: string }) {
    return this.projectService.createProject(body);
  }

  @Get(':id')
  async getProjectDetails(@Param('id') id: string) {
    return this.projectService.getProjectDetails(id);
  }

  @Post(':id/runs')
  async createProjectRun(
    @Param('id') projectId: string,
    @Body() body: {
      displayName: string,
      description?: string,
      targetParticipantCount?: number,
      plannedStartAt?: string,
      plannedEndAt?: string
    }
  ) {
    return this.projectService.createProjectRun(projectId, {
      ...body,
      plannedStartAt: body.plannedStartAt ? new Date(body.plannedStartAt) : undefined,
      plannedEndAt: body.plannedEndAt ? new Date(body.plannedEndAt) : undefined
    });
  }
}
