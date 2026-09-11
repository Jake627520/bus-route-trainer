import { describe, it, expect } from 'vitest';
import {
  selectRecallQueue,
  RecallQueueCandidate,
  DEFAULT_SESSION_SIZE,
  MAX_SESSION_SIZE,
  DEFAULT_DUE_RATIO,
} from '@/domain/learning/recall-queue-policy';
import { CardState } from '@/domain/learning/learning-card';

describe('RecallQueuePolicy (Domain Engine)', () => {
  const fixedNow = new Date('2026-09-11T10:00:00.000Z');

  const makeDueCard = (id: string, minutesAgo: number): RecallQueueCandidate => ({
    cardId: id,
    state: CardState.REVIEW,
    nextReviewAt: new Date(fixedNow.getTime() - minutesAgo * 60000),
  });

  const makeNewCard = (id: string): RecallQueueCandidate => ({
    cardId: id,
    state: CardState.NEW,
    nextReviewAt: null,
  });

  it('(1) exports domain policy constants', () => {
    expect(DEFAULT_SESSION_SIZE).toBe(15);
    expect(MAX_SESSION_SIZE).toBe(20);
    expect(DEFAULT_DUE_RATIO).toBe(0.7);
  });

  it('(2) applies default 70/30 target mix for sessionSize 15 (11 DUE, 4 NEW)', () => {
    // 20 DUE available, 20 NEW available
    const dueCards = Array.from({ length: 20 }, (_, i) =>
      makeDueCard(`due-${String(i).padStart(2, '0')}`, 100 - i),
    );
    const newCards = Array.from({ length: 20 }, (_, i) =>
      makeNewCard(`new-${String(i).padStart(2, '0')}`),
    );

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 15,
    });

    expect(result.cardIds).toHaveLength(15);
    // Math.ceil(15 * 0.7) = 11 DUE cards
    const dueSelected = result.cardIds.filter((id) => id.startsWith('due-'));
    const newSelected = result.cardIds.filter((id) => id.startsWith('new-'));
    expect(dueSelected).toHaveLength(11);
    expect(newSelected).toHaveLength(4);
  });

  it('(3) fills deficit with NEW cards when DUE cards are insufficient', () => {
    // Only 4 DUE cards available, 20 NEW available, sessionSize = 15
    const dueCards = Array.from({ length: 4 }, (_, i) => makeDueCard(`due-${i}`, 50 - i));
    const newCards = Array.from({ length: 20 }, (_, i) => makeNewCard(`new-${i}`));

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 15,
    });

    expect(result.cardIds).toHaveLength(15);
    const dueSelected = result.cardIds.filter((id) => id.startsWith('due-'));
    const newSelected = result.cardIds.filter((id) => id.startsWith('new-'));
    expect(dueSelected).toHaveLength(4);
    expect(newSelected).toHaveLength(11); // 15 - 4 = 11
  });

  it('(4) fills deficit with DUE cards when NEW cards are insufficient', () => {
    // 20 DUE cards available, only 2 NEW available, sessionSize = 15
    const dueCards = Array.from({ length: 20 }, (_, i) => makeDueCard(`due-${i}`, 50 - i));
    const newCards = Array.from({ length: 2 }, (_, i) => makeNewCard(`new-${i}`));

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 15,
    });

    expect(result.cardIds).toHaveLength(15);
    const dueSelected = result.cardIds.filter((id) => id.startsWith('due-'));
    const newSelected = result.cardIds.filter((id) => id.startsWith('new-'));
    expect(newSelected).toHaveLength(2);
    expect(dueSelected).toHaveLength(13); // 15 - 2 = 13
  });

  it('(5) returns all available cards when both pools combined are insufficient', () => {
    const dueCards = [makeDueCard('due-1', 10), makeDueCard('due-2', 5)];
    const newCards = [makeNewCard('new-1')];

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 15,
    });

    expect(result.cardIds).toHaveLength(3);
    expect(result.cardIds).toEqual(['due-1', 'due-2', 'new-1']);
  });

  it('(6) caps session size at MAX_SESSION_SIZE (20) if requested size exceeds it', () => {
    const dueCards = Array.from({ length: 30 }, (_, i) => makeDueCard(`due-${i}`, 100 - i));
    const newCards = Array.from({ length: 30 }, (_, i) => makeNewCard(`new-${i}`));

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 50, // exceeds MAX_SESSION_SIZE
    });

    expect(result.cardIds).toHaveLength(MAX_SESSION_SIZE);
  });

  it('(7) returns empty array when sessionSize is 0 or negative', () => {
    const dueCards = [makeDueCard('due-1', 10)];
    const newCards = [makeNewCard('new-1')];

    expect(
      selectRecallQueue({
        dueCards,
        newCards,
        now: fixedNow,
        sessionSize: 0,
      }).cardIds,
    ).toEqual([]);

    expect(
      selectRecallQueue({
        dueCards,
        newCards,
        now: fixedNow,
        sessionSize: -5,
      }).cardIds,
    ).toEqual([]);
  });

  it('(8) strictly excludes cards present in excludedCardIds (session-level exclusion)', () => {
    const dueCards = [
      makeDueCard('card-excluded-1', 50),
      makeDueCard('card-due-2', 40),
      makeDueCard('card-due-3', 30),
    ];
    const newCards = [
      makeNewCard('card-excluded-2'),
      makeNewCard('card-new-3'),
    ];

    const excluded = new Set(['card-excluded-1', 'card-excluded-2']);

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 10,
      excludedCardIds: excluded,
    });

    expect(result.cardIds).toHaveLength(3);
    expect(result.cardIds).not.toContain('card-excluded-1');
    expect(result.cardIds).not.toContain('card-excluded-2');
    expect(result.cardIds).toEqual(['card-due-2', 'card-due-3', 'card-new-3']);
  });

  it('(9) ensures output contains zero duplicate card IDs even if candidates repeat in input', () => {
    const dueCards = [
      makeDueCard('card-1', 50),
      makeDueCard('card-1', 50), // duplicate candidate
      makeDueCard('card-2', 30),
    ];
    const newCards = [
      makeNewCard('card-2'), // duplicate across pools
      makeNewCard('card-3'),
    ];

    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 10,
    });

    const uniqueSet = new Set(result.cardIds);
    expect(uniqueSet.size).toBe(result.cardIds.length);
  });

  it('(10) orders DUE pool by oldest overdue first (nextReviewAt ASC)', () => {
    const card3DaysAgo = makeDueCard('card-3d', 3 * 24 * 60);
    const card2HoursAgo = makeDueCard('card-2h', 2 * 60);
    const cardExactNow = makeDueCard('card-now', 0);

    const result = selectRecallQueue({
      dueCards: [cardExactNow, card3DaysAgo, card2HoursAgo], // unordered input
      newCards: [],
      now: fixedNow,
      sessionSize: 5,
    });

    expect(result.cardIds).toEqual(['card-3d', 'card-2h', 'card-now']);
  });

  it('(11) uses cardId ASC as deterministic tie-breaker when nextReviewAt timestamps are identical', () => {
    const cardB = makeDueCard('card-b', 10);
    const cardA = makeDueCard('card-a', 10);
    const cardC = makeDueCard('card-c', 10);

    const result = selectRecallQueue({
      dueCards: [cardC, cardA, cardB],
      newCards: [],
      now: fixedNow,
      sessionSize: 5,
    });

    expect(result.cardIds).toEqual(['card-a', 'card-b', 'card-c']);
  });

  it('(12) orders NEW pool deterministically by cardId ASC', () => {
    const newZ = makeNewCard('new-z');
    const newA = makeNewCard('new-a');
    const newM = makeNewCard('new-m');

    const result = selectRecallQueue({
      dueCards: [],
      newCards: [newZ, newA, newM],
      now: fixedNow,
      sessionSize: 5,
    });

    expect(result.cardIds).toEqual(['new-a', 'new-m', 'new-z']);
  });

  it('(13) accepts exact due boundary (nextReviewAt <= now) and filters out future cards (nextReviewAt > now)', () => {
    const exactDueCard = {
      cardId: 'card-exact',
      state: CardState.REVIEW,
      nextReviewAt: new Date(fixedNow.getTime()),
    };
    const futureCard = {
      cardId: 'card-future',
      state: CardState.REVIEW,
      nextReviewAt: new Date(fixedNow.getTime() + 1), // 1ms in the future
    };

    const result = selectRecallQueue({
      dueCards: [futureCard, exactDueCard],
      newCards: [],
      now: fixedNow,
      sessionSize: 5,
    });

    expect(result.cardIds).toEqual(['card-exact']);
  });

  it('(14) respects supplied now date parameter deterministically', () => {
    const customNow = new Date('2026-06-01T12:00:00.000Z');

    const cardDueForCustomNow = {
      cardId: 'card-june',
      state: CardState.REVIEW,
      nextReviewAt: new Date('2026-06-01T11:00:00.000Z'),
    };
    const cardFutureForCustomNow = {
      cardId: 'card-july',
      state: CardState.REVIEW,
      nextReviewAt: new Date('2026-07-01T11:00:00.000Z'),
    };

    const result = selectRecallQueue({
      dueCards: [cardDueForCustomNow, cardFutureForCustomNow],
      newCards: [],
      now: customNow,
      sessionSize: 5,
    });

    expect(result.cardIds).toEqual(['card-june']);
  });

  it('(15) respects custom dueRatio when provided', () => {
    const dueCards = Array.from({ length: 10 }, (_, i) => makeDueCard(`due-${i}`, 10));
    const newCards = Array.from({ length: 10 }, (_, i) => makeNewCard(`new-${i}`));

    // Custom 50/50 ratio for sessionSize 10 -> 5 DUE, 5 NEW
    const result = selectRecallQueue({
      dueCards,
      newCards,
      now: fixedNow,
      sessionSize: 10,
      dueRatio: 0.5,
    });

    const dueSelected = result.cardIds.filter((id) => id.startsWith('due-'));
    const newSelected = result.cardIds.filter((id) => id.startsWith('new-'));
    expect(dueSelected).toHaveLength(5);
    expect(newSelected).toHaveLength(5);
  });
});
