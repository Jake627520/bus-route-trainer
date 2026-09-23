import { PrismaClient } from '@prisma/client';
import {
  MasteryHistoryQueryPort,
  MasteryEvent,
} from '@/application/learning/mastery-history-query-port';
import { CardState } from '@/domain/learning/learning-card';

/**
 * Change 17: 以 RecallAttempt 事件日誌實作精熟歷史查詢。
 * 經 session.driverId 過濾，取 cardKey / resultingState / answeredAt，依 answeredAt 升冪。
 */
export class PrismaMasteryHistoryAdapter implements MasteryHistoryQueryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findMasteryEventsByDriver(driverId: string): Promise<MasteryEvent[]> {
    const rows = await this.prisma.recallAttempt.findMany({
      where: { session: { driverId } },
      orderBy: { answeredAt: 'asc' },
      select: { cardKey: true, resultingState: true, answeredAt: true },
    });
    return rows.map((r) => ({
      cardKey: r.cardKey,
      resultingState: r.resultingState as CardState,
      answeredAt: r.answeredAt,
    }));
  }
}
