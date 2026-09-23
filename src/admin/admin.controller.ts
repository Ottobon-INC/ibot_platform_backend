import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('v1/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('organizations/pending')
  async getPendingOrganizations() {
    return this.adminService.getPendingOrganizations();
  }

  @Get('organizations/:id')
  async getOrganizationDetail(@Param('id') id: string) {
    return this.adminService.getOrganizationDetail(id);
  }

  @Post('organizations/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveOrganization(@Param('id') id: string) {
    return this.adminService.approveOrganization(id);
  }

  @Post('organizations/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectOrganization(@Param('id') id: string) {
    return this.adminService.rejectOrganization(id);
  }
}
