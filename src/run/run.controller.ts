import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { RunService } from './run.service';

@Controller('v1/runs')
export class RunController {
  constructor(private readonly runService: RunService) {}

  @Get(':id')
  async getRunDetails(@Param('id') id: string) {
    return this.runService.getRunDetails(id);
  }

  @Get('phases/:phaseId')
  async getPhaseDetails(@Param('phaseId') phaseId: string) {
    return this.runService.getPhaseDetails(phaseId);
  }

  @Post('phases/:phaseId/assignments')
  async assignPhaseLead(
    @Param('phaseId') phaseId: string,
    @Body() body: {
      organizationId: string;
      personId: string;
      roleId?: string;
      partySide?: string;
    }
  ) {
    return this.runService.assignPhaseLead(phaseId, body);
  }

  @Post('handovers')
  async createHandover(
    @Body() body: {
      organizationId: string;
      projectRunId: string;
      fromRunPhaseId: string;
      toRunPhaseId: string;
      candidateIds: string[];
      initiatedByPersonId: string;
      title?: string;
      reason?: string;
    }
  ) {
    return this.runService.createHandover(body);
  }

  @Post('handovers/:id/accept')
  async acceptHandover(
    @Param('id') handoverId: string,
    @Body() body: { acceptedByPersonId: string }
  ) {
    return this.runService.acceptHandover(handoverId, body.acceptedByPersonId);
  }
}
