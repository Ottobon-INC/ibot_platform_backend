import { Controller, Get } from '@nestjs/common';

@Controller('api/v1/identify')
export class IdentifyController {
  @Get('participants')
  getParticipants() {
    return [
      { id: 'p1', name: 'Alice Smith', status: 'QUALIFIED' },
      { id: 'p2', name: 'Bob Jones', status: 'PENDING' },
    ];
  }
}
