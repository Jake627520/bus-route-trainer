import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/streak/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

/**
 * Change 22 Task 4: GET /api/review/streak 整合測試（真 DB）。
 * 以「今天」seed，避免依賴固定日期。
 */
describe('GET /api/review/streak', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
  };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  it('reports a current streak of 1 after practising today', async () => {
    await prisma.recallSession.create({ data: { id: 's1', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'V' } });
    const now = new Date();
    await prisma.recallAttempt.create({
      data: {
        sessionId: 's1', promptIndex: 0, cardKey: 'c0', recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome: 'PASS',
        startedAt: now, answeredAt: now, durationMs: 100, resultingState: 'REVIEW',
      },
    });

    const body = await (await GET()).json();
    const today = now.toISOString().slice(0, 10);
    expect(body.data).toEqual({ currentStreak: 1, longestStreak: 1, lastPracticedOn: today });
  });

  it('returns zeros when there is no practice', async () => {
    const body = await (await GET()).json();
    expect(body.data).toEqual({ currentStreak: 0, longestStreak: 0, lastPracticedOn: null });
  });
});
