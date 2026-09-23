import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/summary/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

/**
 * Change 11 Task 4: GET /api/review/summary 整合測試（真 DB）。
 * 回 { data: VariantReviewSummary[] }，driver 用 DEFAULT_DRIVER_ID。
 */
describe('GET /api/review/summary', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });
  const cleanup = async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
  };
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
  beforeEach(cleanup);

  const FUTURE = new Date('2999-01-01T00:00:00.000Z');
  const PAST = new Date('2000-01-01T00:00:00.000Z');

  async function seedProgress(variantKey: string) {
    await prisma.driverVariantProgress.create({
      data: {
        id: `prog-${variantKey}`,
        driverId: DEFAULT_DRIVER_ID,
        routeId: 'R-review',
        directionId: 0,
        targetVariantKey: variantKey,
        status: 'IN_PROGRESS',
        cards: {
          create: [
            { id: `c1-${variantKey}`, cardKey: 'STOP::a', cardType: 'STOP', state: 'REVIEW', nextReviewAt: PAST },
            { id: `c2-${variantKey}`, cardKey: 'STOP::b', cardType: 'STOP', state: 'REVIEW', nextReviewAt: PAST },
            { id: `c3-${variantKey}`, cardKey: 'STOP::c', cardType: 'STOP', state: 'REVIEW', nextReviewAt: FUTURE },
            { id: `c4-${variantKey}`, cardKey: 'STOP::d', cardType: 'STOP', state: 'NEW', nextReviewAt: null },
          ],
        },
      },
    });
  }

  it('returns per-variant review summary for the default driver', async () => {
    await seedProgress('V1');

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      routeId: 'R-review',
      variantKey: 'V1',
      directionId: 0,
      status: 'IN_PROGRESS',
      dueCount: 2,
      newCount: 1,
      totalCards: 4,
      nextReviewAt: FUTURE.toISOString(),
    });
  });

  it('returns an empty data array when the driver has no enrolled variants', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });
});
