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

  const seedSession = (id: string, driverId: string, targetVariantKey = 'V') =>
    prisma.recallSession.create({ data: { id, driverId, routeId: 'R', targetVariantKey } });

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

  const seedAttemptAt = (sessionId: string, promptIndex: number, iso: string) =>
    prisma.recallAttempt.create({
      data: {
        sessionId, promptIndex, cardKey: `c${promptIndex}`, recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome: 'PASS',
        startedAt: new Date(iso), answeredAt: new Date(iso), durationMs: 100, resultingState: 'REVIEW',
      },
    });

  it('findAttemptDates returns distinct app-timezone (Brisbane) dates ascending, excluding other drivers', async () => {
    await seedSession('s1', 'driver_default_local');
    await seedSession('s2', 'other');
    // 時間以 Brisbane（UTC+10）日界計：02:00Z=12:00、05:00Z=15:00 皆為當日
    await seedAttemptAt('s1', 0, '2026-03-02T02:00:00.000Z'); // 03-02 Brisbane
    await seedAttemptAt('s1', 1, '2026-03-01T02:00:00.000Z'); // 03-01 Brisbane
    await seedAttemptAt('s1', 2, '2026-03-02T05:00:00.000Z'); // 03-02 Brisbane（同日重複）
    await seedAttemptAt('s2', 0, '2026-03-05T02:00:00.000Z'); // 他 driver

    expect(await adapter.findAttemptDates('driver_default_local')).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('filters counts by variantKey when given', async () => {
    await seedSession('sA', 'driver_default_local', 'VA');
    await seedSession('sB', 'driver_default_local', 'VB');
    await seedAttempt('sA', 0, 'PASS');
    await seedAttempt('sA', 1, 'FAIL');
    await seedAttempt('sB', 0, 'PASS');

    expect(await adapter.countOutcomesByDriver('driver_default_local', 'VA')).toEqual({ total: 2, passed: 1 });
    expect(await adapter.countOutcomesByDriver('driver_default_local')).toEqual({ total: 3, passed: 2 });
  });
});
