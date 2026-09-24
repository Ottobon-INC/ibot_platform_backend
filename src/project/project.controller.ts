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

  @Get('runs')
  async listRuns(@Query('orgId') orgId: string) {
    return this.projectService.listRuns(orgId);
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
  async createProjectRun(@Param('id') id: string, @Body() body: any) {
    return this.projectService.createProjectRun(id, body);
  }
}
