import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/accuracy/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

/**
 * Change 20 Task 4: GET /api/review/accuracy 整合測試（真 DB）。
 */
describe('GET /api/review/accuracy', () => {
  const prisma = new PrismaClient();
  const cleanup = async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
  };
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const req = (qs = '') => new Request('http://localhost/api/review/accuracy' + qs);

  const seedAttempt = (sessionId: string, promptIndex: number, outcome: 'PASS' | 'FAIL') =>
    prisma.recallAttempt.create({
      data: {
        sessionId, promptIndex, cardKey: `c${promptIndex}`, recallMode: 'STOP_NAME_RECOGNITION',
        rawInput: 'x', expectedAnswer: 'x', outcome,
        startedAt: new Date(), answeredAt: new Date(), durationMs: 100, resultingState: 'REVIEW',
      },
    });

  it('returns overall accuracy for the default driver', async () => {
    await prisma.recallSession.create({ data: { id: 's1', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'V' } });
    await seedAttempt('s1', 0, 'PASS');
    await seedAttempt('s1', 1, 'PASS');
    await seedAttempt('s1', 2, 'FAIL');
    await seedAttempt('s1', 3, 'PASS');

    const body = await (await GET(req())).json();
    expect(body.data).toEqual({ totalAttempts: 4, passedAttempts: 3, accuracy: 0.75 });
  });

  it('returns zeros when there are no attempts', async () => {
    const body = await (await GET(req())).json();
    expect(body.data).toEqual({ totalAttempts: 0, passedAttempts: 0, accuracy: 0 });
  });

  it('filters accuracy by variantKey', async () => {
    await prisma.recallSession.create({ data: { id: 'sA', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'VA' } });
    await prisma.recallSession.create({ data: { id: 'sB', driverId: DEFAULT_DRIVER_ID, routeId: 'R', targetVariantKey: 'VB' } });
    await seedAttempt('sA', 0, 'PASS');
    await seedAttempt('sA', 1, 'FAIL');
    await seedAttempt('sB', 0, 'PASS');

    const filtered = await (await GET(req('?variantKey=VA'))).json();
    expect(filtered.data).toEqual({ totalAttempts: 2, passedAttempts: 1, accuracy: 0.5 });
  });
});
