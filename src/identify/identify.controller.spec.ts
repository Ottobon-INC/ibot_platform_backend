import { Test, TestingModule } from '@nestjs/testing';
import { IdentifyController } from './identify.controller';

describe('IdentifyController', () => {
  let controller: IdentifyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentifyController],
    }).compile();

    controller = module.get<IdentifyController>(IdentifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return a list of participants for identify phase', () => {
    const participants = controller.getParticipants();
    expect(Array.isArray(participants)).toBe(true);
    // Since it's a mock, we expect 2 participants (aligning with MSW handler on frontend)
    expect(participants.length).toBe(2);
    expect(participants[0].status).toBe('QUALIFIED');
  });
});
