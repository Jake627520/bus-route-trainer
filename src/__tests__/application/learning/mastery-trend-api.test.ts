import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/mastery-trend/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

/**
 * Change 17 Task 5: GET /api/review/mastery-trend 整合測試（真 DB）。
 */
describe('GET /api/review/mastery-trend', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
  };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  it('returns the mastery trend for the default driver', async () => {
    await prisma.recallSession.create({ data: { id: 's1', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'V' } });
    await prisma.recallAttempt.create({
      data: {
        sessionId: 's1', promptIndex: 0, cardKey: 'cardA', recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome: 'PASS',
        startedAt: new Date('2026-01-01T09:00:00.000Z'), answeredAt: new Date('2026-01-01T09:00:00.000Z'),
        durationMs: 100, resultingState: 'MASTERED',
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([{ date: '2026-01-01', masteredCount: 1 }]);
  });

  it('returns an empty array when the driver has no attempts', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });
});
