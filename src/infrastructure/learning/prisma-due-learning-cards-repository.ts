import { PrismaClient } from '@prisma/client';
import {
  DueLearningCardsQueryPort,
  FindDueCardsParams,
} from '@/application/learning/due-learning-cards-query-port';
import {
  CardState,
  CardType,
  LearningCard,
} from '@/domain/learning/learning-card';
import { SrsLevel } from '@/domain/srs/srs-interval-policy';

export class PrismaDueLearningCardsRepository implements DueLearningCardsQueryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findDueCards(params: FindDueCardsParams): Promise<LearningCard[]> {
    if (params.limit !== undefined && params.limit <= 0) {
      return [];
    }

    const progress = await this.prisma.driverVariantProgress.findUnique({
      where: {
        driverId_targetVariantKey: {
          driverId: params.driverId,
          targetVariantKey: params.variantKey,
        },
      },
      select: { id: true },
    });

    if (!progress) {
      return [];
    }

    const records = await this.prisma.learningCard.findMany({
      where: {
        progressId: progress.id,
        nextReviewAt: {
          lte: params.now,
          not: null,
        },
      },
      orderBy: [
        { nextReviewAt: 'asc' },
        { id: 'asc' },
      ],
      take: params.limit,
    });

    return records.map((record) => this.toDomain(record));
  }

  private toDomain(record: {
    id: string;
    progressId: string;
    cardKey: string;
    cardType: string;
    state: string;
    srsLevel: number;
    nextReviewAt: Date | null;
    repetitions: number;
    lapses: number;
  }): LearningCard {
    return new LearningCard({
      id: record.id,
      progressId: record.progressId,
      cardKey: record.cardKey,
      cardType: record.cardType as CardType,
      state: record.state as CardState,
      srsLevel: record.srsLevel as SrsLevel,
      nextReviewAt: record.nextReviewAt,
      repetitions: record.repetitions,
      lapses: record.lapses,
    });
  }
}
