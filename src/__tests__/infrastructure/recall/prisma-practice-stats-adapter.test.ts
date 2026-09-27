import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPracticeStatsAdapter } from '@/infrastructure/recall/prisma-practice-stats-adapter';

/**
 * Change 20 Task 1: PracticeStatsQueryPort adapter 整合測試（真 DB）。
 * countOutcomesByDriver 統計該 driver 的 attempt 總數與 PASS 數，排除他 driver。
 */
describe('PrismaPracticeStatsAdapter', () => {
  const prisma = new PrismaClient();
  const adapter = new PrismaPracticeStatsAdapter(prisma);

  const cleanup = async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
  };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const seedSession = (id: string, driverId: string) =>
    prisma.recallSession.create({ data: { id, driverId, routeId: 'R', targetVariantKey: 'V' } });

  const seedAttempt = (sessionId: string, promptIndex: number, outcome: 'PASS' | 'FAIL') =>
    prisma.recallAttempt.create({
      data: {
        sessionId, promptIndex, cardKey: `c${promptIndex}`, recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome,
        startedAt: new Date(), answeredAt: new Date(), durationMs: 100, resultingState: 'REVIEW',
      },
    });

  it('counts total and passed attempts for the driver, excluding others', async () => {
    await seedSession('s1', 'driver_default_local');
    await seedSession('s2', 'other');
    await seedAttempt('s1', 0, 'PASS');
    await seedAttempt('s1', 1, 'FAIL');
    await seedAttempt('s1', 2, 'PASS');
    await seedAttempt('s2', 0, 'PASS');

    expect(await adapter.countOutcomesByDriver('driver_default_local')).toEqual({ total: 3, passed: 2 });
  });

  it('returns zeros for a driver with no attempts', async () => {
    expect(await adapter.countOutcomesByDriver('nobody')).toEqual({ total: 0, passed: 0 });
  });
});
