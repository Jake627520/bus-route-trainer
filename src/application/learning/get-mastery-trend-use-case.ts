import { MasteryHistoryQueryPort } from '@/application/learning/mastery-history-query-port';
import { CardState } from '@/domain/learning/learning-card';

export interface MasteryTrendPoint {
  /** UTC 日期 YYYY-MM-DD。 */
  date: string;
  /** 該日結束時處於 MASTERED 狀態的卡數。 */
  masteredCount: number;
}

export interface GetMasteryTrendCommand {
  driverId: string;
}

/**
 * Change 17: 由精熟事件日誌重放出每日精熟度時序。
 * 維護每張卡的最新狀態，依 UTC 日分桶；每個有結算的日期在套用完當日事件後，
 * 快照當下 MASTERED 卡數。狀態跨日延續，lapse 會使後續日期回落。
 */
export class GetMasteryTrendUseCase {
  constructor(private readonly historyPort: MasteryHistoryQueryPort) {}

  async execute(command: GetMasteryTrendCommand): Promise<MasteryTrendPoint[]> {
    const events = await this.historyPort.findMasteryEventsByDriver(command.driverId);

    const state = new Map<string, CardState>();
    const points: MasteryTrendPoint[] = [];

    let i = 0;
    while (i < events.length) {
      const date = events[i].answeredAt.toISOString().slice(0, 10);
      while (i < events.length && events[i].answeredAt.toISOString().slice(0, 10) === date) {
        state.set(events[i].cardKey, events[i].resultingState);
        i++;
      }
      let masteredCount = 0;
      for (const s of state.values()) if (s === CardState.MASTERED) masteredCount++;
      points.push({ date, masteredCount });
    }

    return points;
  }
}
