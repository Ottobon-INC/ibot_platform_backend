import { Module } from '@nestjs/common';
import { IdentifyController } from './identify.controller';

@Module({
  controllers: [IdentifyController],
})
export class IdentifyModule {}
