import { PrismaClient } from '@prisma/client';
import { LearningCard } from '@/domain/learning/learning-card';
import {
  BackfillCardsRepository,
  ProgressForBackfill,
} from '@/application/learning/backfill-variant-cards-use-case';

/** Change 46: 補卡用的最小查詢／寫入（只取 cardKey，不載入整張卡）。 */
export class PrismaBackfillCardsRepository implements BackfillCardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProgressForBackfill(
    driverId: string,
    variantKey: string,
  ): Promise<ProgressForBackfill | null> {
    const row = await this.prisma.driverVariantProgress.findUnique({
      where: { driverId_targetVariantKey: { driverId, targetVariantKey: variantKey } },
      select: {
        id: true,
        routeId: true,
        targetVariantKey: true,
        cardsVersion: true,
        cards: { select: { cardKey: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      routeId: row.routeId,
      targetVariantKey: row.targetVariantKey,
      cardsVersion: row.cardsVersion,
      cardKeys: row.cards.map((c) => c.cardKey),
    };
  }

  async addCardsAndSetVersion(
    progressId: string,
    cards: LearningCard[],
    version: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (cards.length > 0) {
        await tx.learningCard.createMany({
          data: cards.map((c) => ({
            id: c.id,
            progressId,
            cardKey: c.cardKey,
            cardType: c.cardType,
            state: c.state,
            srsLevel: 0,
            nextReviewAt: null,
            repetitions: 0,
            lapses: 0,
          })),
          // 併發下另一個請求可能同時補同一張卡
          skipDuplicates: true,
        });
      }
      await tx.driverVariantProgress.update({
        where: { id: progressId },
        data: { cardsVersion: version },
      });
    });
  }
}
