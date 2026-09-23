import { describe, it, expect, vi } from 'vitest';
import { GetReviewSummaryUseCase } from '@/application/learning/get-review-summary-use-case';
import { ListDriverProgressPort } from '@/application/learning/list-driver-progress-port';
import {
  VariantHeadsignQueryPort,
  VariantHeadsign,
} from '@/application/learning/variant-headsign-query-port';
import { Clock } from '@/application/common/clock';
import { DriverVariantProgress, ProgressStatus } from '@/domain/learning/driver-variant-progress';
import { LearningCard, CardType, CardState } from '@/domain/learning/learning-card';

/**
 * Change 11 Task 1: GetReviewSummaryUseCase 單元測試（純邏輯、免 DB）。
 * 對每個 enrolled variant 由 cards 算 dueCount / newCount / totalCards / nextReviewAt，
 * 依 dueCount 由多到少排序。
 */
describe('Change 11: GetReviewSummaryUseCase', () => {
  const NOW = new Date('2026-09-23T00:00:00.000Z');
  const fixedClock: Clock = { now: () => NOW };

  const card = (id: string, progressId: string, state: CardState, nextReviewAt: Date | null) =>
    new LearningCard({ id, progressId, cardKey: `STOP::${id}`, cardType: CardType.STOP, state, nextReviewAt });

  const progress = (
    id: string, routeId: string, directionId: number, variantKey: string,
    status: ProgressStatus, cards: LearningCard[],
  ) =>
    new DriverVariantProgress({
      id, driverId: 'driver_default_local', routeId, directionId, targetVariantKey: variantKey, status, cards,
    });

  const fakePort = (list: DriverVariantProgress[]): ListDriverProgressPort => ({
    findAllByDriver: async () => list,
  });

  const headsignPort = (
    byRoute: Record<string, VariantHeadsign[] | 'throw'>
  ): VariantHeadsignQueryPort => ({
    findHeadsignsByRoute: vi.fn(async (routeId: string) => {
      const v = byRoute[routeId];
      if (v === 'throw') throw new Error('gtfs down');
      return v ?? [];
    }),
  });

  const noHeadsigns: VariantHeadsignQueryPort = { findHeadsignsByRoute: async () => [] };

  const past = new Date('2026-09-22T00:00:00.000Z');
  const future = new Date('2026-09-24T00:00:00.000Z');
  const farFuture = new Date('2027-01-01T00:00:00.000Z');

  it('computes due/new/mastered/total/nextReviewAt per variant and sorts by dueCount desc', async () => {
    const a = progress('pA', 'R1', 0, 'V1', ProgressStatus.IN_PROGRESS, [
      card('a1', 'pA', CardState.REVIEW, past),        // due
      card('a2', 'pA', CardState.REVIEW, past),        // due
      card('a3', 'pA', CardState.REVIEW, future),      // upcoming
      card('a4', 'pA', CardState.NEW, null),           // new
      card('a5', 'pA', CardState.MASTERED, farFuture), // mastered (未到期，非最早)
    ]);
    const b = progress('pB', 'R2', 1, 'V2', ProgressStatus.NOT_STARTED, [
      card('b1', 'pB', CardState.REVIEW, past),      // due, no upcoming
    ]);

    const useCase = new GetReviewSummaryUseCase(
      fakePort([b, a]),
      fixedClock,
      headsignPort({ R1: [{ variantKey: 'V1', headsign: 'City → Uni' }], R2: [{ variantKey: 'V2', headsign: null }] })
    );
    const result = await useCase.execute({ driverId: 'driver_default_local' });

    // 依 dueCount 由多到少：A(2) 在 B(1) 前
    expect(result.map((r) => r.variantKey)).toEqual(['V1', 'V2']);

    expect(result[0]).toEqual({
      routeId: 'R1', variantKey: 'V1', directionId: 0, status: ProgressStatus.IN_PROGRESS, headsign: 'City → Uni',
      dueCount: 2, newCount: 1, masteredCount: 1, totalCards: 5, nextReviewAt: future.toISOString(),
    });
    expect(result[1]).toEqual({
      routeId: 'R2', variantKey: 'V2', directionId: 1, status: ProgressStatus.NOT_STARTED, headsign: null,
      dueCount: 1, newCount: 0, masteredCount: 0, totalCards: 1, nextReviewAt: null,
    });
  });

  it('groups headsign lookups by route, fills null when missing, and degrades on lookup error', async () => {
    const cards = [card('c', 'p', CardState.REVIEW, past)];
    const p1 = progress('p1', 'R9', 0, 'V9a', ProgressStatus.IN_PROGRESS, cards);
    const p2 = progress('p2', 'R9', 1, 'V9b', ProgressStatus.IN_PROGRESS, cards);
    const p3 = progress('p3', 'R9', 0, 'V9c', ProgressStatus.IN_PROGRESS, cards); // 不在查詢結果 → null
    const p4 = progress('p4', 'R-err', 0, 'Verr', ProgressStatus.IN_PROGRESS, cards); // 查詢丟錯 → null

    const port = headsignPort({
      R9: [{ variantKey: 'V9a', headsign: 'Head A' }, { variantKey: 'V9b', headsign: 'Head B' }],
      'R-err': 'throw',
    });
    const useCase = new GetReviewSummaryUseCase(fakePort([p1, p2, p3, p4]), fixedClock, port);

    const result = await useCase.execute({ driverId: 'driver_default_local' });
    const byKey = new Map(result.map((r) => [r.variantKey, r.headsign]));

    expect(byKey.get('V9a')).toBe('Head A');
    expect(byKey.get('V9b')).toBe('Head B');
    expect(byKey.get('V9c')).toBeNull();   // 查得到路線但無此 variant
    expect(byKey.get('Verr')).toBeNull();  // 查詢失敗降級，不中斷其他列
    expect(result).toHaveLength(4);

    // R9 只查一次（分組），R-err 一次
    expect(port.findHeadsignsByRoute).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when the driver has no enrolled variants', async () => {
    const useCase = new GetReviewSummaryUseCase(fakePort([]), fixedClock, noHeadsigns);
    expect(await useCase.execute({ driverId: 'driver_default_local' })).toEqual([]);
  });
});
