import type { PrismaClient } from '@prisma/client';
import type { ReminderStatsQuery } from '@/application/push/push.port';

/**
 * Change 52: 提醒用的純計數查詢——不載入站名、車次或題目，一次 count 搞定（避免 N+1）。
 * 「到期」定義與 isCardDue 相同：nextReviewAt 非空且 <= now（NEW 卡沒有日期，不算到期）。
 */
export class PrismaReminderStatsQuery implements ReminderStatsQuery {
  constructor(private readonly prisma: PrismaClient) {}

  countDueCards(driverId: string, now: Date): Promise<number> {
    return this.prisma.learningCard.count({
      where: { progress: { driverId }, nextReviewAt: { lte: now } },
    });
  }

  async hasAttemptSince(driverId: string, since: Date): Promise<boolean> {
    const n = await this.prisma.recallAttempt.count({
      where: { answeredAt: { gte: since }, session: { driverId } },
      take: 1,
    });
    return n > 0;
  }
}
