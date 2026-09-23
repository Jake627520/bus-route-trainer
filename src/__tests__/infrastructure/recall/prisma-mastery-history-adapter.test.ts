import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaMasteryHistoryAdapter } from '@/infrastructure/recall/prisma-mastery-history-adapter';
import { CardState } from '@/domain/learning/learning-card';

/**
 * Change 17 Task 1: MasteryHistoryQueryPort adapter 整合測試（真 DB）。
 * 依 session.driverId 撈 attempt 的 cardKey/resultingState/answeredAt，依 answeredAt 升冪。
 */
describe('PrismaMasteryHistoryAdapter', () => {
  const prisma = new PrismaClient();
  const adapter = new PrismaMasteryHistoryAdapter(prisma);

  const cleanup = async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
  };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const seedSession = async (id: string, driverId: string) => {
    await prisma.recallSession.create({
      data: { id, driverId, routeId: 'R', targetVariantKey: 'V' },
    });
  };
  const seedAttempt = async (
    sessionId: string, promptIndex: number, cardKey: string, resultingState: CardState, answeredAt: Date
  ) => {
    await prisma.recallAttempt.create({
      data: {
        sessionId, promptIndex, cardKey, recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome: 'PASS',
        startedAt: answeredAt, answeredAt, durationMs: 100,
        resultingState: resultingState as unknown as 'MASTERED',
      },
    });
  };

  it('returns the driver events ordered by answeredAt, excluding other drivers', async () => {
    await seedSession('s1', 'driver_default_local');
    await seedSession('s2', 'other');
    await seedAttempt('s1', 0, 'cardA', CardState.MASTERED, new Date('2026-01-02T00:00:00.000Z'));
    await seedAttempt('s1', 1, 'cardB', CardState.LEARNING, new Date('2026-01-01T00:00:00.000Z'));
    await seedAttempt('s2', 0, 'cardX', CardState.MASTERED, new Date('2026-01-03T00:00:00.000Z'));

    const result = await adapter.findMasteryEventsByDriver('driver_default_local');

    expect(result.map((e) => e.cardKey)).toEqual(['cardB', 'cardA']); // asc by answeredAt
    expect(result[0]).toMatchObject({ cardKey: 'cardB', resultingState: CardState.LEARNING });
    expect(result[1]).toMatchObject({ cardKey: 'cardA', resultingState: CardState.MASTERED });
    expect(result.every((e) => e.answeredAt instanceof Date)).toBe(true);
  });

  it('returns [] for a driver with no attempts', async () => {
    expect(await adapter.findMasteryEventsByDriver('nobody')).toEqual([]);
  });
});
