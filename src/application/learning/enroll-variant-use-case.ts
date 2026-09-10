import { randomUUID } from 'crypto';
import {
  DriverVariantProgress,
  ProgressStatus,
} from '@/domain/learning/driver-variant-progress';
import { generateCardsForOrderedStops } from '@/domain/learning/card-key-generator';
import {
  LearningProgressRepository,
  DriverVariantProgressDto,
} from './learning-progress-repository.port';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { DEFAULT_DRIVER_ID } from './auth-constants';

export class VariantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariantNotFoundError';
  }
}

export interface EnrollVariantCommand {
  driverId?: string;
  routeId: string;
  variantKey: string;
}

export interface EnrollVariantResult {
  progress: DriverVariantProgressDto;
  isNew: boolean;
}

export class EnrollVariantUseCase {
  constructor(
    private readonly learningRepo: LearningProgressRepository,
    private readonly getRouteVariantsUseCase: GetRouteVariantsUseCase
  ) {}

  async execute(command: EnrollVariantCommand): Promise<EnrollVariantResult> {
    const driverId = command.driverId || DEFAULT_DRIVER_ID;

    // 1. Sequential idempotency check
    const existing = await this.learningRepo.findByDriverAndVariant(
      driverId,
      command.variantKey
    );
    if (existing) {
      return {
        progress: this.toDto(existing),
        isNew: false,
      };
    }

    // 2. Query target variant topology from GTFS read use case
    const variants = await this.getRouteVariantsUseCase.execute(command.routeId);
    const targetVariant = variants.find((v) => v.variantKey === command.variantKey);

    if (!targetVariant) {
      throw new VariantNotFoundError(
        `Target route variant '${command.variantKey}' does not exist for route '${command.routeId}'`
      );
    }

    // 3. Generate cards from variant's ordered stops
    const progressId = randomUUID();
    const orderedStopIds = targetVariant.orderedStops.map((s) => s.stopId);
    const cards = generateCardsForOrderedStops(progressId, orderedStopIds);

    const newProgress = new DriverVariantProgress({
      id: progressId,
      driverId,
      routeId: command.routeId,
      directionId: targetVariant.directionId,
      targetVariantKey: command.variantKey,
      status: ProgressStatus.NOT_STARTED,
      cards,
    });

    // 4. Atomically persist with concurrent race conflict resolution
    try {
      await this.learningRepo.saveProgressWithCards(newProgress);
      return {
        progress: this.toDto(newProgress),
        isNew: true,
      };
    } catch (err: unknown) {
      // Only resolve concurrent race if the error is a P2002 unique constraint violation on enrollment
      const isUniqueConstraint =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === 'P2002';

      const target = (err as { meta?: { target?: string[] | string; modelName?: string } })?.meta;
      const targetFields = target?.target;
      const modelName = target?.modelName;

      const isEnrollmentConflict =
        modelName === 'DriverVariantProgress' ||
        (Array.isArray(targetFields) &&
          (targetFields.includes('targetVariantKey') || targetFields.includes('driverId'))) ||
        (typeof targetFields === 'string' &&
          (targetFields.includes('targetVariantKey') || targetFields.includes('driver_variant_progress')));

      if (isUniqueConstraint && isEnrollmentConflict) {
        const raceWinner = await this.learningRepo.findByDriverAndVariant(
          driverId,
          command.variantKey
        );
        if (raceWinner) {
          return {
            progress: this.toDto(raceWinner),
            isNew: false,
          };
        }
      }
      throw err;
    }
  }

  private toDto(progress: DriverVariantProgress): DriverVariantProgressDto {
    return {
      id: progress.id,
      driverId: progress.driverId,
      routeId: progress.routeId,
      directionId: progress.directionId,
      targetVariantKey: progress.targetVariantKey,
      status: progress.status,
      enrolledAt: progress.enrolledAt.toISOString(),
      lastStudiedAt: progress.lastStudiedAt ? progress.lastStudiedAt.toISOString() : null,
      totalCards: progress.cards.length,
    };
  }
}
