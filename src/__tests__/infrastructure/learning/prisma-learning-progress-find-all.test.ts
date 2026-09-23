import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { DriverVariantProgress, ProgressStatus } from '@/domain/learning/driver-variant-progress';
import { LearningCard, CardType, CardState } from '@/domain/learning/learning-card';

/**
 * Change 11 Task 2: findAllByDriver 整合測試（真 DB）。
 * 只回傳指定 driver 的 progress，且每筆含其 cards。
 */
describe('PrismaLearningProgressRepository.findAllByDriver', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaLearningProgressRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });
  const cleanup = async () => {
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
  };
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
  beforeEach(cleanup);

  const seed = async (
    id: string, driverId: string, routeId: string, directionId: number, variantKey: string,
    cardSpecs: Array<{ id: string; state: CardState }>,
  ) => {
    const cards = cardSpecs.map(
      (c) => new LearningCard({ id: c.id, progressId: id, cardKey: `STOP::${c.id}`, cardType: CardType.STOP, state: c.state })
    );
    await repository.saveProgressWithCards(
      new DriverVariantProgress({ id, driverId, routeId, directionId, targetVariantKey: variantKey, status: ProgressStatus.IN_PROGRESS, cards })
    );
  };

  it('returns only the target driver progress, each with its cards', async () => {
    await seed('p1', 'driver_default_local', 'R1', 0, 'V1', [
      { id: 'c1', state: CardState.REVIEW },
      { id: 'c2', state: CardState.NEW },
    ]);
    await seed('p2', 'driver_default_local', 'R2', 1, 'V2', [{ id: 'c3', state: CardState.REVIEW }]);
    await seed('p3', 'other_driver', 'R3', 0, 'V3', [{ id: 'c4', state: CardState.NEW }]);

    const result = await repository.findAllByDriver('driver_default_local');

    expect(result).toHaveLength(2);
    const byVariant = new Map(result.map((p) => [p.targetVariantKey, p]));
    expect([...byVariant.keys()].sort()).toEqual(['V1', 'V2']);
    expect(byVariant.get('V1')!.cards).toHaveLength(2);
    expect(byVariant.get('V2')!.cards).toHaveLength(1);
  });

  it('returns an empty array for a driver with no progress', async () => {
    expect(await repository.findAllByDriver('nobody')).toEqual([]);
  });
});
