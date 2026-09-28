import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RunService {
  constructor(private readonly db: DatabaseService) {}

  async getRunDetails(runId: string) {
    const run = await this.db.projectRun.findUnique({
      where: { id: runId },
      include: {
        project: true,
        organization: true,
        setupVersions: {
          orderBy: { versionNo: 'desc' },
          take: 1
        },
        runPhases: {
          include: {
            phaseAssignments: {
              include: { person: true }
            },
            configVersions: {
              orderBy: { versionNo: 'desc' },
              take: 1
            }
          },
          orderBy: { sequenceNo: 'asc' }
        },
        runAssignments: {
          include: { person: true }
        },
        runParticipations: true
      }
    });

    if (!run) throw new NotFoundException('Project Run not found');
    return run;
  }

  async assignPhaseLead(runPhaseId: string, data: {
    organizationId: string;
    personId: string;
    roleId?: string;
    partySide?: string;
  }) {
    const phase = await this.db.runPhase.findUnique({
      where: { id: runPhaseId }
    });

    if (!phase) throw new NotFoundException('Run Phase not found');

    const defaultRoleId = data.roleId || '00000000-0000-0000-0000-000000000001';
    const partySide = data.partySide || phase.ownershipType || 'ORGANIZATION';

    // Create phase assignment record
    return this.db.phaseAssignment.create({
      data: {
        organizationId: data.organizationId || phase.organizationId,
        runPhaseId: phase.id,
        personId: data.personId,
        roleId: defaultRoleId,
        partySide: partySide === 'SHARED' ? 'ORGANIZATION' : partySide,
        status: 'ACTIVE',
        effectiveFrom: new Date()
      },
      include: {
        person: true,
        runPhase: true
      }
    });
  }

  async getPhaseDetails(runPhaseId: string) {
    const phase = await this.db.runPhase.findUnique({
      where: { id: runPhaseId },
      include: {
        projectRun: {
          include: { project: true }
        },
        phaseAssignments: {
          include: { person: true }
        },
        phaseParticipations: {
          include: { person: true },
          orderBy: { enteredAt: 'desc' }
        },
        configVersions: {
          orderBy: { versionNo: 'desc' },
          take: 1
        }
      }
    });

    if (!phase) throw new NotFoundException('Run Phase not found');
    return phase;
  }

  async createHandover(data: {
    organizationId: string;
    projectRunId: string;
    fromRunPhaseId: string;
    toRunPhaseId: string;
    candidateIds: string[]; // PhaseParticipation IDs or Person IDs
    initiatedByPersonId: string;
    title?: string;
    reason?: string;
  }) {
    const fromPhase = await this.db.runPhase.findUnique({ where: { id: data.fromRunPhaseId } });
    const toPhase = await this.db.runPhase.findUnique({ where: { id: data.toRunPhaseId } });

    if (!fromPhase || !toPhase) throw new BadRequestException('Invalid source or target run phase');

    // Fetch phase participations for candidate IDs
    const sourceParticipations = await this.db.phaseParticipation.findMany({
      where: {
        runPhaseId: data.fromRunPhaseId,
        id: { in: data.candidateIds }
      }
    });

    if (sourceParticipations.length === 0) {
      throw new BadRequestException('No valid candidate participations found for handover');
    }

    return this.db.handover.create({
      data: {
        organizationId: data.organizationId,
        projectRunId: data.projectRunId,
        fromRunPhaseId: data.fromRunPhaseId,
        toRunPhaseId: data.toRunPhaseId,
        status: 'SENT',
        title: data.title || `Handover: ${fromPhase.phaseType} -> ${toPhase.phaseType}`,
        reason: data.reason || 'Qualified candidates ready for next phase intake.',
        initiatedByPersonId: data.initiatedByPersonId,
        sentAt: new Date(),

        handoverParticipants: {
          create: sourceParticipations.map((sp) => ({
            organizationId: data.organizationId,
            runParticipationId: sp.runParticipationId,
            sourcePhaseParticipationId: sp.id,
            validationStatus: 'VALID',
            status: 'SELECTED',
            selectedByPersonId: data.initiatedByPersonId,
            selectedAt: new Date()
          }))
        }
      },
      include: {
        handoverParticipants: true
      }
    });
  }

  async acceptHandover(handoverId: string, acceptedByPersonId: string) {
    const handover = await this.db.handover.findUnique({
      where: { id: handoverId },
      include: {
        handoverParticipants: true
      }
    });

    if (!handover) throw new NotFoundException('Handover package not found');
    if (handover.status === 'ACCEPTED') throw new BadRequestException('Handover has already been accepted');

    const now = new Date();

    // 1. Update Handover status to ACCEPTED
    const updatedHandover = await this.db.handover.update({
      where: { id: handoverId },
      data: {
        status: 'ACCEPTED',
        acceptedByPersonId,
        acceptedAt: now
      }
    });

    // 2. Create PhaseParticipation records in target phase for each accepted candidate
    for (const hp of handover.handoverParticipants) {
      // Find source participation personId
      const sourcePart = await this.db.phaseParticipation.findUnique({
        where: { id: hp.sourcePhaseParticipationId }
      });

      if (sourcePart) {
        // Create new PhaseParticipation in target phase
        const targetPart = await this.db.phaseParticipation.create({
          data: {
            organizationId: handover.organizationId,
            runPhaseId: handover.toRunPhaseId,
            runParticipationId: hp.runParticipationId,
            personId: sourcePart.personId,
            status: 'ACTIVE',
            intakeSourceType: 'HANDOVER',
            intakeHandoverId: handover.id,
            enteredAt: now
          }
        });

        // Update HandoverParticipant item
        await this.db.handoverParticipant.update({
          where: { id: hp.id },
          data: {
            status: 'ACCEPTED',
            targetPhaseParticipationId: targetPart.id
          }
        });

        // Mark source phase participation status to COMPLETED
        await this.db.phaseParticipation.update({
          where: { id: sourcePart.id },
          data: { status: 'COMPLETED' }
        });
      }
    }

    return updatedHandover;
  }
}
