import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor() {}

  async onModuleInit() {
    console.log('Mock DB Connected');
  }

  async onModuleDestroy() {
    console.log('Mock DB Disconnected');
  }
}
