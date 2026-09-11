import { describe, it, expect } from 'vitest';
import { RecallSessionPlan } from '@/domain/learning/recall-session-plan';

describe('RecallSessionPlan (Domain Model)', () => {
  const fixedNow = new Date('2026-09-11T10:00:00.000Z');

  it('(1) successfully instantiates with valid parameters and preserves card order', () => {
    const cardIds = ['card-1', 'card-2', 'card-3'];
    const plan = new RecallSessionPlan({
      sessionId: 'session-123',
      cardIds,
      createdAt: fixedNow,
    });

    expect(plan.sessionId).toBe('session-123');
    expect(plan.cardIds).toEqual(['card-1', 'card-2', 'card-3']);
    expect(plan.createdAt.toISOString()).toBe(fixedNow.toISOString());
  });

  it('(2) throws error if cardIds is empty', () => {
    expect(
      () =>
        new RecallSessionPlan({
          sessionId: 'session-123',
          cardIds: [],
          createdAt: fixedNow,
        }),
    ).toThrow(/Recall session cannot be empty/);
  });

  it('(3) throws error if cardIds contains duplicates', () => {
    expect(
      () =>
        new RecallSessionPlan({
          sessionId: 'session-123',
          cardIds: ['card-1', 'card-2', 'card-1'],
          createdAt: fixedNow,
        }),
    ).toThrow(/Recall session cannot contain duplicate cards/);
  });

  it('(4) guarantees immutability: cardIds is frozen and createdAt is defensively cloned', () => {
    const mutableCardIds = ['card-a', 'card-b'];
    const mutableDate = new Date('2026-09-11T10:00:00.000Z');

    const plan = new RecallSessionPlan({
      sessionId: 'session-123',
      cardIds: mutableCardIds,
      createdAt: mutableDate,
    });

    // Mutating external array does not affect plan
    mutableCardIds.push('card-c');
    expect(plan.cardIds).toEqual(['card-a', 'card-b']);

    // Attempting to mutate plan.cardIds throws in strict mode / is frozen
    expect(Object.isFrozen(plan.cardIds)).toBe(true);

    // Mutating original Date object does not affect plan.createdAt
    mutableDate.setFullYear(2030);
    expect(plan.createdAt.toISOString()).toBe('2026-09-11T10:00:00.000Z');

    // Mutating the Date object returned by getter does not mutate internal state
    const returnedDate = plan.createdAt;
    returnedDate.setFullYear(2035);
    expect(plan.createdAt.toISOString()).toBe('2026-09-11T10:00:00.000Z');
  });
});
