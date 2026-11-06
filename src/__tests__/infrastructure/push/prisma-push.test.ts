import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPushSubscriptionRepository } from '@/infrastructure/push/prisma-push-subscription-repository';
import { PrismaReminderStatsQuery } from '@/infrastructure/push/prisma-reminder-stats-query';

/** Change 52: 需要真的 Postgres。 */
describe('Change 52: Prisma push repository + reminder stats (integration)', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaPushSubscriptionRepository(prisma);
  const stats = new PrismaReminderStatsQuery(prisma);
  const NOW = new Date('2026-10-14T19:00:00Z');

  const cleanup = async () => {
    await prisma.pushSubscription.deleteMany();
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.driver.deleteMany({ where: { username: { startsWith: 'push-test-' } } });
  };
  const mkDriver = (name: string) =>
    prisma.driver.create({ data: { username: `push-test-${name}`, passwordHash: 'h', passwordSalt: 's' } });

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });
  beforeEach(cleanup);

  const sub = (driverId: string, n = 1) => ({
    driverId, endpoint: `https://push.example/${driverId}/${n}`, p256dh: 'p', auth: 'a', locale: 'en' as const,
  });

  describe('subscriptions', () => {
    it('upsert is idempotent per endpoint and transfers the device to a new driver', async () => {
      const a = await mkDriver('a');
      const b = await mkDriver('b');
      await repo.upsert({ ...sub(a.id), endpoint: 'https://push.example/x' });
      await repo.upsert({ ...sub(a.id), endpoint: 'https://push.example/x' });
      expect(await repo.countByDriver(a.id)).toBe(1);
      await repo.upsert({ ...sub(b.id), endpoint: 'https://push.example/x', locale: 'zh-TW' });
      expect(await repo.countByDriver(a.id)).toBe(0);
      expect(await repo.countByDriver(b.id)).toBe(1);
      const rows = await prisma.pushSubscription.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].locale).toBe('zh-TW');
    });

    it('re-subscribing the same device keeps today\'s "already checked" mark only for the same driver', async () => {
      const a = await mkDriver('a');
      const b = await mkDriver('b');
      await repo.upsert({ ...sub(a.id), endpoint: 'https://push.example/x' });
      const [row] = await prisma.pushSubscription.findMany();
      await repo.markChecked(row.id, '2026-10-15');
      await repo.upsert({ ...sub(a.id), endpoint: 'https://push.example/x' });
      expect((await prisma.pushSubscription.findMany())[0].lastCheckedDay).toBe('2026-10-15');
      await repo.upsert({ ...sub(b.id), endpoint: 'https://push.example/x' });
      expect((await prisma.pushSubscription.findMany())[0].lastCheckedDay).toBeNull();
    });

    it('existsForDriver / deleteByEndpoint only touch the owner\'s rows', async () => {
      const a = await mkDriver('a');
      const b = await mkDriver('b');
      await repo.upsert({ ...sub(a.id), endpoint: 'https://push.example/x' });
      expect(await repo.existsForDriver(a.id, 'https://push.example/x')).toBe(true);
      expect(await repo.existsForDriver(b.id, 'https://push.example/x')).toBe(false);
      await repo.deleteByEndpoint(b.id, 'https://push.example/x');
      expect(await repo.countByDriver(a.id)).toBe(1);
      await repo.deleteByEndpoint(a.id, 'https://push.example/x');
      expect(await repo.countByDriver(a.id)).toBe(0);
    });

    it('findNotCheckedOn excludes today\'s checked rows, respects the limit; markChecked and deleteById work', async () => {
      const a = await mkDriver('a');
      for (let i = 1; i <= 3; i++) await repo.upsert(sub(a.id, i));
      let pending = await repo.findNotCheckedOn('2026-10-15', 10);
      expect(pending).toHaveLength(3);
      expect(pending[0]).toMatchObject({ driverId: a.id, locale: 'en', lastCheckedDay: null });
      await repo.markChecked(pending[0].id, '2026-10-15');
      pending = await repo.findNotCheckedOn('2026-10-15', 10);
      expect(pending).toHaveLength(2);
      expect(await repo.findNotCheckedOn('2026-10-15', 1)).toHaveLength(1);
      // 隔天又會被撈出來
      expect(await repo.findNotCheckedOn('2026-10-16', 10)).toHaveLength(3);
      await repo.deleteById(pending[0].id);
      expect(await prisma.pushSubscription.count()).toBe(2);
    });

    it('deleting a driver removes their subscriptions', async () => {
      const a = await mkDriver('a');
      await repo.upsert(sub(a.id));
      await prisma.driver.delete({ where: { id: a.id } });
      expect(await prisma.pushSubscription.count()).toBe(0);
    });
  });

  describe('reminder stats', () => {
    const mkProgress = (driverId: string, variantKey: string) =>
      prisma.driverVariantProgress.create({
        data: { driverId, routeId: 'R', directionId: 0, targetVariantKey: variantKey },
      });
    const mkCard = (progressId: string, key: string, nextReviewAt: Date | null) =>
      prisma.learningCard.create({
        data: { progressId, cardKey: key, cardType: 'NEXT_STOP', nextReviewAt },
      });

    it('counts due cards across all of the driver\'s variants — and only theirs; NEW cards (no review date) are not due', async () => {
      const p1 = await mkProgress('drv-1', 'V1');
      const p2 = await mkProgress('drv-1', 'V2');
      const other = await mkProgress('drv-2', 'V1');
      await mkCard(p1.id, 'a', new Date('2026-10-14T00:00:00Z'));          // 到期
      await mkCard(p1.id, 'b', new Date('2026-10-14T19:00:00Z'));          // 剛好此刻 = 到期
      await mkCard(p1.id, 'c', new Date('2026-10-14T19:00:01Z'));          // 未到期
      await mkCard(p1.id, 'd', null);                                      // 新卡
      await mkCard(p2.id, 'e', new Date('2026-10-01T00:00:00Z'));          // 到期（另一條路線）
      await mkCard(other.id, 'f', new Date('2026-10-01T00:00:00Z'));       // 別人的
      expect(await stats.countDueCards('drv-1', NOW)).toBe(3);
      expect(await stats.countDueCards('drv-2', NOW)).toBe(1);
      expect(await stats.countDueCards('nobody', NOW)).toBe(0);
    });

    it('hasAttemptSince is true only for that driver\'s attempts at/after the cut-off', async () => {
      await prisma.recallSession.create({ data: { id: 's1', driverId: 'drv-1', routeId: 'R', targetVariantKey: 'V' } });
      await prisma.recallSession.create({ data: { id: 's2', driverId: 'drv-2', routeId: 'R', targetVariantKey: 'V' } });
      const attempt = (sessionId: string, answeredAt: string) =>
        prisma.recallAttempt.create({
          data: {
            sessionId, promptIndex: 0, cardKey: 'c', recallMode: 'NEXT_STOP_FORWARD', rawInput: 'x',
            expectedAnswer: 'x', outcome: 'PASS', startedAt: new Date(answeredAt), answeredAt: new Date(answeredAt), durationMs: 1,
          },
        });
      await attempt('s1', '2026-10-14T13:59:59Z'); // Brisbane 前一天
      const dayStart = new Date('2026-10-14T14:00:00Z');
      expect(await stats.hasAttemptSince('drv-1', dayStart)).toBe(false);
      await attempt('s2', '2026-10-14T20:00:00Z'); // 別人今天有練
      expect(await stats.hasAttemptSince('drv-1', dayStart)).toBe(false);
      expect(await stats.hasAttemptSince('drv-2', dayStart)).toBe(true);
    });
  });
});
