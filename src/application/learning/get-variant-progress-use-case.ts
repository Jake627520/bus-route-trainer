import { CardType } from '@/domain/learning/learning-card';
import {
  LearningProgressRepository,
  DriverVariantProgressWithCardsDto,
  LearningCardDto,
} from './learning-progress-repository.port';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { RouteVariantDto } from '@/application/gtfs/gtfs-read-repository.port';
import { DEFAULT_DRIVER_ID } from './auth-constants';

export class ProgressNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgressNotFoundError';
  }
}

export interface GetVariantProgressQuery {
  driverId?: string;
  variantKey: string;
}

export class GetVariantProgressUseCase {
  constructor(
    private readonly learningRepo: LearningProgressRepository,
    private readonly getRouteVariantsUseCase: GetRouteVariantsUseCase
  ) {}

  async execute(query: GetVariantProgressQuery): Promise<DriverVariantProgressWithCardsDto> {
    const driverId = query.driverId || DEFAULT_DRIVER_ID;

    // 1. Query progress from learning repository
    const progress = await this.learningRepo.findByDriverAndVariant(
      driverId,
      query.variantKey
    );

    if (!progress) {
      throw new ProgressNotFoundError(
        `Driver '${driverId}' has not enrolled in route variant '${query.variantKey}'`
      );
    }

    // 2. Locate current GTFS topology if available (never throw if GTFS data is missing)
    let currentVariant: RouteVariantDto | null = null;
    try {
      const variants = await this.getRouteVariantsUseCase.execute(progress.routeId);
      currentVariant = variants.find((v) => v.variantKey === query.variantKey) ?? null;
    } catch {
      currentVariant = null;
    }

    // Build stopSequence lookup map if current topology resolves
    const stopSequenceMap = new Map<string, number>();
    if (currentVariant) {
      for (const st of currentVariant.orderedStops) {
        stopSequenceMap.set(st.stopId, st.stopSequence);
      }
    }

    // 3. Project dynamic sequence onto cards
    const cardDtos: LearningCardDto[] = progress.cards.map((card) => {
      let currentSequence: number | null = null;

      if (currentVariant) {
        if (card.cardType === CardType.STOP) {
          // Format: STOP::{stopId}
          const stopId = card.cardKey.replace('STOP::', '');
          currentSequence = stopSequenceMap.get(stopId) ?? null;
        } else if (card.cardType === CardType.NEXT_STOP) {
          // Format: NEXT_STOP::{fromStopId}->{toStopId}
          const edge = card.cardKey.replace('NEXT_STOP::', '');
          const [fromStopId] = edge.split('->');
          // Departure station sequence
          currentSequence = stopSequenceMap.get(fromStopId) ?? null;
        }
      }

      return {
        id: card.id,
        cardKey: card.cardKey,
        cardType: card.cardType,
        state: card.state,
        nextReviewAt: card.nextReviewAt ? card.nextReviewAt.toISOString() : null,
        repetitions: card.repetitions,
        lapses: card.lapses,
        currentSequence,
      };
    });

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
      cards: cardDtos,
    };
  }
}
