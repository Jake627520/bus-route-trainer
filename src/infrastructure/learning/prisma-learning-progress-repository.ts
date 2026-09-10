import {
  PrismaClient,
  ProgressStatus as PrismaProgressStatus,
  CardType as PrismaCardType,
  CardState as PrismaCardState,
} from '@prisma/client';
import {
  DriverVariantProgress,
  ProgressStatus,
} from '@/domain/learning/driver-variant-progress';
import { LearningCard, CardType, CardState } from '@/domain/learning/learning-card';
import { LearningProgressRepository } from '@/application/learning/learning-progress-repository.port';

export class PrismaLearningProgressRepository implements LearningProgressRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByDriverAndVariant(
    driverId: string,
    variantKey: string
  ): Promise<DriverVariantProgress | null> {
    const record = await this.prisma.driverVariantProgress.findUnique({
      where: {
        driverId_targetVariantKey: {
          driverId,
          targetVariantKey: variantKey,
        },
      },
      include: {
        cards: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async findById(id: string): Promise<DriverVariantProgress | null> {
    const record = await this.prisma.driverVariantProgress.findUnique({
      where: { id },
      include: {
        cards: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!record) return null;
    return this.toDomain(record);
  }

  async saveProgressWithCards(progress: DriverVariantProgress): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.driverVariantProgress.create({
        data: {
          id: progress.id,
          driverId: progress.driverId,
          routeId: progress.routeId,
          directionId: progress.directionId,
          targetVariantKey: progress.targetVariantKey,
          status: progress.status as PrismaProgressStatus,
          enrolledAt: progress.enrolledAt,
          lastStudiedAt: progress.lastStudiedAt,
        },
      });

      if (progress.cards.length > 0) {
        await tx.learningCard.createMany({
          data: progress.cards.map((card) => ({
            id: card.id,
            progressId: card.progressId,
            cardKey: card.cardKey,
            cardType: card.cardType as PrismaCardType,
            state: card.state as PrismaCardState,
            nextReviewAt: card.nextReviewAt,
            repetitions: card.repetitions,
            lapses: card.lapses,
          })),
        });
      }
    });
  }

  private toDomain(record: {
    id: string;
    driverId: string;
    routeId: string;
    directionId: number;
    targetVariantKey: string;
    status: string;
    enrolledAt: Date;
    lastStudiedAt: Date | null;
    cards: Array<{
      id: string;
      progressId: string;
      cardKey: string;
      cardType: string;
      state: string;
      nextReviewAt: Date | null;
      repetitions: number;
      lapses: number;
    }>;
  }): DriverVariantProgress {
    const domainCards = record.cards.map(
      (c) =>
        new LearningCard({
          id: c.id,
          progressId: c.progressId,
          cardKey: c.cardKey,
          cardType: c.cardType as CardType,
          state: c.state as CardState,
          nextReviewAt: c.nextReviewAt,
          repetitions: c.repetitions,
          lapses: c.lapses,
        })
    );

    return new DriverVariantProgress({
      id: record.id,
      driverId: record.driverId,
      routeId: record.routeId,
      directionId: record.directionId,
      targetVariantKey: record.targetVariantKey,
      status: record.status as ProgressStatus,
      enrolledAt: record.enrolledAt,
      lastStudiedAt: record.lastStudiedAt,
      cards: domainCards,
    });
  }
}
