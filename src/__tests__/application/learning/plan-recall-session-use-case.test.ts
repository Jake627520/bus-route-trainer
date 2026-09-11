import { describe, it, expect, vi } from 'vitest';
import { PlanRecallSessionUseCase } from '@/application/learning/plan-recall-session-use-case';
import { DueLearningCardsQueryPort } from '@/application/learning/due-learning-cards-query-port';
import { NewLearningCardsQueryPort } from '@/application/learning/new-learning-cards-query-port';
import { Clock } from '@/application/common/clock';
import { CardState, CardType, LearningCard } from '@/domain/learning/learning-card';

describe('PlanRecallSessionUseCase (Application Layer)', () => {
  const fixedNow = new Date('2026-09-11T10:00:00.000Z');

  const mockClock: Clock = {
    now: () => fixedNow,
  };

  const makeDueCard = (id: string, minutesAgo: number): LearningCard =>
    new LearningCard({
      id,
      progressId: 'prog-1',
      cardKey: `key-${id}`,
      cardType: CardType.STOP,
      state: CardState.REVIEW,
      srsLevel: 1,
      nextReviewAt: new Date(fixedNow.getTime() - minutesAgo * 60000),
      repetitions: 1,
      lapses: 0,
    });

  const makeNewCard = (id: string): LearningCard =>
    new LearningCard({
      id,
      progressId: 'prog-1',
      cardKey: `key-${id}`,
      cardType: CardType.STOP,
      state: CardState.NEW,
      srsLevel: 0,
      nextReviewAt: null,
      repetitions: 0,
      lapses: 0,
    });

  const createMockPorts = (dueCards: LearningCard[] = [], newCards: LearningCard[] = []) => {
    const duePort: DueLearningCardsQueryPort = {
      findDueCards: vi.fn().mockResolvedValue(dueCards),
    };
    const newPort: NewLearningCardsQueryPort = {
      findNewCards: vi.fn().mockResolvedValue(newCards),
    };
    return { duePort, newPort };
  };

  it('(1) [DUE + NEW] selects mixed candidates according to target ratio (11 DUE, 4 NEW for size 15)', async () => {
    const dueCards = Array.from({ length: 20 }, (_, i) => makeDueCard(`due-${i}`, 100 - i));
    const newCards = Array.from({ length: 20 }, (_, i) => makeNewCard(`new-${i}`));
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
    });

    expect(result.plan).not.toBeNull();
    expect(result.plan!.cardIds).toHaveLength(15);
    expect(result.selectedDueCount).toBe(11);
    expect(result.selectedNewCount).toBe(4);
    expect(result.totalEligibleCount).toBe(40);
  });

  it('(2) [DUE only] fills all slots with DUE when NEW is empty', async () => {
    const dueCards = Array.from({ length: 20 }, (_, i) => makeDueCard(`due-${i}`, 100 - i));
    const { duePort, newPort } = createMockPorts(dueCards, []);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
    });

    expect(result.plan).not.toBeNull();
    expect(result.plan!.cardIds).toHaveLength(15);
    expect(result.selectedDueCount).toBe(15);
    expect(result.selectedNewCount).toBe(0);
    expect(result.totalEligibleCount).toBe(20);
  });

  it('(3) [NEW only] fills all slots with NEW when DUE is empty', async () => {
    const newCards = Array.from({ length: 20 }, (_, i) => makeNewCard(`new-${i}`));
    const { duePort, newPort } = createMockPorts([], newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
    });

    expect(result.plan).not.toBeNull();
    expect(result.plan!.cardIds).toHaveLength(15);
    expect(result.selectedDueCount).toBe(0);
    expect(result.selectedNewCount).toBe(15);
    expect(result.totalEligibleCount).toBe(20);
  });

  it('(4) [both empty] returns plan: null and 0 counts when both candidate pools are empty', async () => {
    const { duePort, newPort } = createMockPorts([], []);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
    });

    expect(result.plan).toBeNull();
    expect(result.selectedDueCount).toBe(0);
    expect(result.selectedNewCount).toBe(0);
    expect(result.totalEligibleCount).toBe(0);
  });

  it('(5) [all excluded] returns plan: null when all candidates are in excludedCardIds', async () => {
    const dueCards = [makeDueCard('due-1', 10)];
    const newCards = [makeNewCard('new-1')];
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
      excludedCardIds: new Set(['due-1', 'new-1']),
    });

    expect(result.plan).toBeNull();
    expect(result.selectedDueCount).toBe(0);
    expect(result.selectedNewCount).toBe(0);
    expect(result.totalEligibleCount).toBe(0);
  });

  it('(6) [partial excluded] excludes specified cards and selects remaining eligible candidates', async () => {
    const dueCards = [makeDueCard('due-ex', 50), makeDueCard('due-ok', 40)];
    const newCards = [makeNewCard('new-ex'), makeNewCard('new-ok')];
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 10,
      excludedCardIds: new Set(['due-ex', 'new-ex']),
    });

    expect(result.plan).not.toBeNull();
    expect(result.plan!.cardIds).toEqual(['due-ok', 'new-ok']);
    expect(result.selectedDueCount).toBe(1);
    expect(result.selectedNewCount).toBe(1);
    expect(result.totalEligibleCount).toBe(2);
  });

  it('(7) [sessionSize defaults & clamps] respects default 15, caps at 20, returns null on <= 0', async () => {
    const dueCards = Array.from({ length: 30 }, (_, i) => makeDueCard(`due-${i}`, 100 - i));
    const newCards = Array.from({ length: 30 }, (_, i) => makeNewCard(`new-${i}`));
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);

    // Default sessionSize = 15
    const defaultRes = await useCase.execute({
      sessionId: 'sess-def',
      driverId: 'driver-1',
      variantKey: 'var-1',
    });
    expect(defaultRes.plan!.cardIds).toHaveLength(15);

    // Exceeding MAX_SESSION_SIZE (capped to 20)
    const cappedRes = await useCase.execute({
      sessionId: 'sess-cap',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 50,
    });
    expect(cappedRes.plan!.cardIds).toHaveLength(20);

    // <= 0 returns null
    const zeroRes = await useCase.execute({
      sessionId: 'sess-zero',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 0,
    });
    expect(zeroRes.plan).toBeNull();
  });

  it('(8) [custom dueRatio] passes custom ratio to policy (e.g. 0.5 for 50/50 mix)', async () => {
    const dueCards = Array.from({ length: 10 }, (_, i) => makeDueCard(`due-${i}`, 50 - i));
    const newCards = Array.from({ length: 10 }, (_, i) => makeNewCard(`new-${i}`));
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 10,
      dueRatio: 0.5,
    });

    expect(result.selectedDueCount).toBe(5);
    expect(result.selectedNewCount).toBe(5);
  });

  it('(9) [Clock propagation] passes authoritativeNow to due query, policy, and plan creation', async () => {
    const customTime = new Date('2026-12-25T08:00:00.000Z');
    const customClock: Clock = { now: () => customTime };

    const dueCards = [makeDueCard('due-1', 10)];
    const { duePort, newPort } = createMockPorts(dueCards, []);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, customClock);
    const result = await useCase.execute({
      sessionId: 'sess-custom-clock',
      driverId: 'driver-1',
      variantKey: 'var-1',
    });

    // Verify Clock passed to Due query
    expect(duePort.findDueCards).toHaveBeenCalledWith(
      expect.objectContaining({ now: customTime }),
    );

    // Verify Clock passed to plan snapshot
    expect(result.plan!.createdAt.toISOString()).toBe(customTime.toISOString());
  });

  it('(10) [queue candidate parameter mapping] maps LearningCard fields into candidates cleanly', async () => {
    const dueCard = makeDueCard('due-map-1', 15);
    const newCard = makeNewCard('new-map-1');
    const { duePort, newPort } = createMockPorts([dueCard], [newCard]);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-map',
      driverId: 'driver-1',
      variantKey: 'var-1',
    });

    expect(result.plan).not.toBeNull();
    expect(result.plan!.cardIds).toContain('due-map-1');
    expect(result.plan!.cardIds).toContain('new-map-1');
  });

  it('(11) [RecallSessionPlan snapshot immutability] returns deeply frozen and validated plan', async () => {
    const dueCards = [makeDueCard('due-1', 10)];
    const { duePort, newPort } = createMockPorts(dueCards, []);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-snap',
      driverId: 'driver-1',
      variantKey: 'var-1',
    });

    const plan = result.plan!;
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.cardIds)).toBe(true);

    // Mutating getter Date clone does not mutate internal timestamp
    const clonedDate = plan.createdAt;
    clonedDate.setFullYear(2040);
    expect(plan.createdAt.toISOString()).toBe(fixedNow.toISOString());
  });

  it('(12) [DUE shortage backfill (Anti-Starvation Guard)] fills remaining slots from NEW when DUE is scarce', async () => {
    // 2 DUE available, 20 NEW available, sessionSize = 15 -> 2 DUE + 13 NEW
    const dueCards = [makeDueCard('due-1', 10), makeDueCard('due-2', 20)];
    const newCards = Array.from({ length: 20 }, (_, i) => makeNewCard(`new-${i}`));
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-anti-starve-1',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
    });

    expect(result.selectedDueCount).toBe(2);
    expect(result.selectedNewCount).toBe(13);
    expect(result.plan!.cardIds).toHaveLength(15);
  });

  it('(13) [NEW shortage backfill (Anti-Starvation Guard)] fills remaining slots from DUE when NEW is scarce', async () => {
    // 20 DUE available, 2 NEW available, sessionSize = 15 -> 13 DUE + 2 NEW
    const dueCards = Array.from({ length: 20 }, (_, i) => makeDueCard(`due-${i}`, 100 - i));
    const newCards = [makeNewCard('new-1'), makeNewCard('new-2')];
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-anti-starve-2',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
    });

    expect(result.selectedDueCount).toBe(13);
    expect(result.selectedNewCount).toBe(2);
    expect(result.plan!.cardIds).toHaveLength(15);
  });

  it('(14) [Excluded + backfill] backfills from available pool when primary pool cards are excluded', async () => {
    // 11 DUE (where 8 are excluded -> 3 DUE left), 10 NEW -> 3 DUE + 10 NEW = 13 cards total
    const dueCards = Array.from({ length: 11 }, (_, i) => makeDueCard(`due-${i}`, 50 - i));
    const newCards = Array.from({ length: 10 }, (_, i) => makeNewCard(`new-${i}`));
    const { duePort, newPort } = createMockPorts(dueCards, newCards);

    const excludedCardIds = new Set([
      'due-0', 'due-1', 'due-2', 'due-3', 'due-4', 'due-5', 'due-6', 'due-7',
    ]);

    const useCase = new PlanRecallSessionUseCase(duePort, newPort, mockClock);
    const result = await useCase.execute({
      sessionId: 'sess-ex-backfill',
      driverId: 'driver-1',
      variantKey: 'var-1',
      sessionSize: 15,
      excludedCardIds,
    });

    expect(result.selectedDueCount).toBe(3);
    expect(result.selectedNewCount).toBe(10);
    expect(result.plan!.cardIds).toHaveLength(13);
    expect(result.totalEligibleCount).toBe(13);
  });
});
