import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/mastery-trend/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { sessionCookie } from '@/__tests__/helpers/session';

/**
 * Change 17 Task 5 / 29: GET /api/review/mastery-trend 整合測試（真 DB，強制認證）。
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

  const req = (qs = '') =>
    new Request('http://localhost/api/review/mastery-trend' + qs, { headers: { cookie: sessionCookie(DEFAULT_DRIVER_ID) } });
  const reqNoAuth = () => new Request('http://localhost/api/review/mastery-trend');

  const seedAttempt = async (sessionId: string, promptIndex: number, cardKey: string, iso: string) =>
    prisma.recallAttempt.create({
      data: {
        sessionId, promptIndex, cardKey, recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome: 'PASS',
        startedAt: new Date(iso), answeredAt: new Date(iso), durationMs: 100, resultingState: 'MASTERED',
      },
    });

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

    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([{ date: '2026-01-01', masteredCount: 1 }]);
  });

  it('returns an empty array when the driver has no attempts', async () => {
    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });

  it('filters the trend by variantKey when the query param is present', async () => {
    await prisma.recallSession.create({ data: { id: 'sA', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'VA' } });
    await prisma.recallSession.create({ data: { id: 'sB', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'VB' } });
    await seedAttempt('sA', 0, 'cardA', '2026-01-01T09:00:00.000Z');
    await seedAttempt('sB', 0, 'cardB', '2026-01-02T09:00:00.000Z');

    const filtered = await (await GET(req('?variantKey=VA'))).json();
    expect(filtered.data).toEqual([{ date: '2026-01-01', masteredCount: 1 }]);

    const overall = await (await GET(req())).json();
    expect(overall.data).toEqual([
      { date: '2026-01-01', masteredCount: 1 },
      { date: '2026-01-02', masteredCount: 2 },
    ]);
  });

  it('returns 401 when unauthenticated (Change 29)', async () => {
    const res = await GET(reqNoAuth());
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });
});
