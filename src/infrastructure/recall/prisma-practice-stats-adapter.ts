import { PrismaClient } from '@prisma/client';
import {
  PracticeStatsQueryPort,
  OutcomeCounts,
} from '@/application/learning/practice-stats-query-port';

/**
 * Change 20: 以 RecallAttempt 統計練習結果（經 session.driverId）。
 */
export class PrismaPracticeStatsAdapter implements PracticeStatsQueryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async countOutcomesByDriver(driverId: string): Promise<OutcomeCounts> {
    const [total, passed] = await Promise.all([
      this.prisma.recallAttempt.count({ where: { session: { driverId } } }),
      this.prisma.recallAttempt.count({ where: { session: { driverId }, outcome: 'PASS' } }),
    ]);
    return { total, passed };
  }
}
