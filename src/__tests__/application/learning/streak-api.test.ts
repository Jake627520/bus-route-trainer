import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/streak/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/app/_lib/session';

/**
 * Change 22 Task 4: GET /api/review/streak 整合測試（真 DB）。
 * Change 26: 改用 resolveDriverId(request)；無 session 回 DEFAULT、帶 session 回登入司機。
 */
const reqNoCookie = () => new Request('http://localhost/api/review/streak');
const reqWithSession = (driverId: string) => {
  const token = signSession({ driverId }, getAuthSecret(), 3600_000);
  return new Request('http://localhost/api/review/streak', {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  });
};

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

    const body = await (await GET(reqNoCookie())).json();
    const today = now.toISOString().slice(0, 10);
    expect(body.data).toEqual({ currentStreak: 1, longestStreak: 1, lastPracticedOn: today });
  });

  it('returns zeros when there is no practice', async () => {
    const body = await (await GET(reqNoCookie())).json();
    expect(body.data).toEqual({ currentStreak: 0, longestStreak: 0, lastPracticedOn: null });
  });

  it('isolates by logged-in driver from the session cookie (Change 26)', async () => {
    // DEFAULT driver 今天有練習，另一位登入司機沒有 → 帶 session 應回 0
    await prisma.recallSession.create({ data: { id: 's2', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'V' } });
    const now = new Date();
    await prisma.recallAttempt.create({
      data: {
        sessionId: 's2', promptIndex: 0, cardKey: 'c0', recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome: 'PASS',
        startedAt: now, answeredAt: now, durationMs: 100, resultingState: 'REVIEW',
      },
    });

    const other = await (await GET(reqWithSession('drv-alice'))).json();
    expect(other.data).toEqual({ currentStreak: 0, longestStreak: 0, lastPracticedOn: null });

    const def = await (await GET(reqNoCookie())).json();
    expect(def.data.currentStreak).toBe(1);
  });
});
