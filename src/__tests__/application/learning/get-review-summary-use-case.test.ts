import { describe, it, expect } from 'vitest';
import { GetReviewSummaryUseCase } from '@/application/learning/get-review-summary-use-case';
import { ListDriverProgressPort } from '@/application/learning/list-driver-progress-port';
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

    const useCase = new GetReviewSummaryUseCase(fakePort([b, a]), fixedClock);
    const result = await useCase.execute({ driverId: 'driver_default_local' });

    // 依 dueCount 由多到少：A(2) 在 B(1) 前
    expect(result.map((r) => r.variantKey)).toEqual(['V1', 'V2']);

    expect(result[0]).toEqual({
      routeId: 'R1', variantKey: 'V1', directionId: 0, status: ProgressStatus.IN_PROGRESS,
      dueCount: 2, newCount: 1, masteredCount: 1, totalCards: 5, nextReviewAt: future.toISOString(),
    });
    expect(result[1]).toEqual({
      routeId: 'R2', variantKey: 'V2', directionId: 1, status: ProgressStatus.NOT_STARTED,
      dueCount: 1, newCount: 0, masteredCount: 0, totalCards: 1, nextReviewAt: null,
    });
  });

  it('returns an empty array when the driver has no enrolled variants', async () => {
    const useCase = new GetReviewSummaryUseCase(fakePort([]), fixedClock);
    expect(await useCase.execute({ driverId: 'driver_default_local' })).toEqual([]);
  });
});
