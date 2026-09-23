import { describe, it, expect } from 'vitest';
import { GetMasteryTrendUseCase } from '@/application/learning/get-mastery-trend-use-case';
import {
  MasteryHistoryQueryPort,
  MasteryEvent,
} from '@/application/learning/mastery-history-query-port';
import { CardState } from '@/domain/learning/learning-card';

/**
 * Change 17 Task 3: GetMasteryTrendUseCase 重放（純邏輯、免 DB）。
 * 逐日快照精熟卡數，跨日狀態延續，lapse 回落，同日多筆取最終態，無事件→[]。
 */
describe('Change 17: GetMasteryTrendUseCase', () => {
  const port = (events: MasteryEvent[]): MasteryHistoryQueryPort => ({
    findMasteryEventsByDriver: async () => events,
  });
  const ev = (cardKey: string, state: CardState, iso: string): MasteryEvent => ({
    cardKey,
    resultingState: state,
    answeredAt: new Date(iso),
  });

  it('emits one point per UTC date, carrying state forward, dropping on lapse', async () => {
    const useCase = new GetMasteryTrendUseCase(
      port([
        ev('A', CardState.MASTERED, '2026-01-01T09:00:00.000Z'),
        ev('B', CardState.MASTERED, '2026-01-02T09:00:00.000Z'),
        ev('A', CardState.LEARNING, '2026-01-03T09:00:00.000Z'), // lapse
      ])
    );

    const result = await useCase.execute({ driverId: 'driver_default_local' });

    expect(result).toEqual([
      { date: '2026-01-01', masteredCount: 1 }, // A
      { date: '2026-01-02', masteredCount: 2 }, // A, B（延續）
      { date: '2026-01-03', masteredCount: 1 }, // A 回落，剩 B
    ]);
  });

  it('collapses same-day events into one point using the final state', async () => {
    const useCase = new GetMasteryTrendUseCase(
      port([
        ev('A', CardState.LEARNING, '2026-02-01T08:00:00.000Z'),
        ev('A', CardState.MASTERED, '2026-02-01T20:00:00.000Z'), // 同日稍後精熟
        ev('B', CardState.MASTERED, '2026-02-01T21:00:00.000Z'),
      ])
    );

    const result = await useCase.execute({ driverId: 'driver_default_local' });
    expect(result).toEqual([{ date: '2026-02-01', masteredCount: 2 }]);
  });

  it('returns an empty array when there are no attempts', async () => {
    const useCase = new GetMasteryTrendUseCase(port([]));
    expect(await useCase.execute({ driverId: 'driver_default_local' })).toEqual([]);
  });
});
