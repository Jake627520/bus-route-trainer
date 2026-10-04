import { describe, it, expect, vi } from 'vitest';
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
        // 皆為同一 Brisbane 日（UTC+10）：00:00Z=10:00、02:00Z=12:00、03:00Z=13:00 於 2026-02-01
        ev('A', CardState.LEARNING, '2026-02-01T00:00:00.000Z'),
        ev('A', CardState.MASTERED, '2026-02-01T02:00:00.000Z'), // 同日稍後精熟
        ev('B', CardState.MASTERED, '2026-02-01T03:00:00.000Z'),
      ])
    );

    const result = await useCase.execute({ driverId: 'driver_default_local' });
    expect(result).toEqual([{ date: '2026-02-01', masteredCount: 2 }]);
  });

  it('returns an empty array when there are no attempts', async () => {
    const useCase = new GetMasteryTrendUseCase(port([]));
    expect(await useCase.execute({ driverId: 'driver_default_local' })).toEqual([]);
  });

  it('passes variantKey through to the history port', async () => {
    const spy = vi.fn(async () => []);
    const useCase = new GetMasteryTrendUseCase({ findMasteryEventsByDriver: spy });
    await useCase.execute({ driverId: 'driver_default_local', variantKey: 'VX' });
    expect(spy).toHaveBeenCalledWith('driver_default_local', 'VX');
  });
});
