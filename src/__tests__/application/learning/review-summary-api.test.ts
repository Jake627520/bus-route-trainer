import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/review/summary/route';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';
import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/app/_lib/session';

/**
 * Change 11 Task 4 / 26: GET /api/review/summary 整合測試（真 DB）。
 * 無 session→DEFAULT_DRIVER_ID；帶 session→登入司機。
 */
const reqNoCookie = () => new Request('http://localhost/api/review/summary');
const reqWithSession = (driverId: string) => {
  const token = signSession({ driverId }, getAuthSecret(), 3600_000);
  return new Request('http://localhost/api/review/summary', {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  });
};
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
            { id: `c5-${variantKey}`, cardKey: 'STOP::e', cardType: 'STOP', state: 'MASTERED', nextReviewAt: FUTURE },
          ],
        },
      },
    });
  }

  it('returns per-variant review summary for the default driver', async () => {
    await seedProgress('V1');

    const response = await GET(reqNoCookie());
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
      masteredCount: 1,
      totalCards: 5,
      nextReviewAt: FUTURE.toISOString(),
      // 未 seed GTFS 路線 → headsign 優雅降級為 null（欄位仍存在）
      headsign: null,
    });
  });

  it('returns an empty data array when the driver has no enrolled variants', async () => {
    const response = await GET(reqNoCookie());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([]);
  });

  it('isolates by logged-in driver from the session cookie (Change 26)', async () => {
    // DEFAULT driver 有 enrolled variant，另一登入司機沒有 → 帶 session 回空陣列
    await seedProgress('V1');
    const other = await GET(reqWithSession('drv-bob'));
    expect((await other.json()).data).toEqual([]);
    const def = await GET(reqNoCookie());
    expect((await def.json()).data).toHaveLength(1);
  });
});
