import { PrismaClient } from '@prisma/client';
import {
  PracticeStatsQueryPort,
  OutcomeCounts,
} from '@/application/learning/practice-stats-query-port';
import { toAppDateString } from '@/application/common/app-timezone';

/**
 * Change 20: 以 RecallAttempt 統計練習結果（經 session.driverId）。
 */
export class PrismaPracticeStatsAdapter implements PracticeStatsQueryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async countOutcomesByDriver(driverId: string, variantKey?: string): Promise<OutcomeCounts> {
    const session = variantKey ? { driverId, targetVariantKey: variantKey } : { driverId };
    const [total, passed] = await Promise.all([
      this.prisma.recallAttempt.count({ where: { session } }),
      this.prisma.recallAttempt.count({ where: { session, outcome: 'PASS' } }),
    ]);
    return { total, passed };
  }

  async findAttemptDates(driverId: string): Promise<string[]> {
    const rows = await this.prisma.recallAttempt.findMany({
      where: { session: { driverId } },
      select: { answeredAt: true },
      orderBy: { answeredAt: 'asc' },
    });
    const dates = new Set<string>();
    for (const r of rows) dates.add(toAppDateString(r.answeredAt));
    return [...dates].sort();
  }
}
