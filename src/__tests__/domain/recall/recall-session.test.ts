import { describe, it, expect } from 'vitest';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
  InvalidStateTransitionError,
  RecallSessionCannotBeEmptyError,
  DuplicateCardInSessionError,
} from '@/domain/recall/recall-session';

describe('RecallSession Domain Entity Unit Tests', () => {
  const sampleProps = {
    id: 'session-123',
    driverId: 'driver-alice',
    routeId: 'R66',
    targetVariantKey: 'R66_DIR0_stop_1>stop_2>stop_3',
    status: SessionStatus.IN_PROGRESS,
    currentPromptIndex: 0,
    currentCardKey: 'STOP::stop_1',
    currentRecallMode: RecallMode.STOP_NAME_RECOGNITION,
    currentExpectedAnswer: 'rbwh',
    currentPromptStartedAt: new Date('2026-09-10T10:00:00Z'),
    startedAt: new Date('2026-09-10T10:00:00Z'),
    completedAt: null,
    abandonedAt: null,
    plannedCardIds: ['STOP::stop_1', 'NEXT_STOP::stop_1->stop_2'],
  };

  it('initializes in IN_PROGRESS status with prompt snapshot fields', () => {
    const session = new RecallSession(sampleProps);

    expect(session.id).toBe('session-123');
    expect(session.driverId).toBe('driver-alice');
    expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session.currentPromptIndex).toBe(0);
    expect(session.currentCardKey).toBe('STOP::stop_1');
    expect(session.currentRecallMode).toBe(RecallMode.STOP_NAME_RECOGNITION);
    expect(session.currentExpectedAnswer).toBe('rbwh');
    expect(session.currentPromptStartedAt).toEqual(new Date('2026-09-10T10:00:00Z'));
  });

  it('successfully transitions from IN_PROGRESS to COMPLETED and records completedAt', () => {
    const session = new RecallSession(sampleProps);
    const completeTime = new Date('2026-09-10T10:05:00Z');

    session.complete(completeTime);

    expect(session.status).toBe(SessionStatus.COMPLETED);
    expect(session.completedAt).toEqual(completeTime);
    expect(session.currentRecallMode).toBeNull();
    expect(session.currentExpectedAnswer).toBeNull();
  });

  it('successfully transitions from IN_PROGRESS to ABANDONED and records abandonedAt', () => {
    const session = new RecallSession(sampleProps);
    const abandonTime = new Date('2026-09-10T10:02:00Z');

    session.abandon(abandonTime);

    expect(session.status).toBe(SessionStatus.ABANDONED);
    expect(session.abandonedAt).toEqual(abandonTime);
    expect(session.currentRecallMode).toBeNull();
    expect(session.currentExpectedAnswer).toBeNull();
  });

  it('allows idempotent complete on an already COMPLETED session', () => {
    const session = new RecallSession({
      ...sampleProps,
      status: SessionStatus.COMPLETED,
      completedAt: new Date('2026-09-10T10:05:00Z'),
    });

    session.complete(new Date('2026-09-10T10:06:00Z'));
    expect(session.status).toBe(SessionStatus.COMPLETED);
    // Preserves original completedAt
    expect(session.completedAt).toEqual(new Date('2026-09-10T10:05:00Z'));
  });

  it('allows idempotent abandon on an already ABANDONED session', () => {
    const session = new RecallSession({
      ...sampleProps,
      status: SessionStatus.ABANDONED,
      abandonedAt: new Date('2026-09-10T10:02:00Z'),
    });

    session.abandon(new Date('2026-09-10T10:03:00Z'));
    expect(session.status).toBe(SessionStatus.ABANDONED);
    expect(session.abandonedAt).toEqual(new Date('2026-09-10T10:02:00Z'));
  });

  it('rejects cross-terminal transition from ABANDONED to COMPLETED', () => {
    const session = new RecallSession({
      ...sampleProps,
      status: SessionStatus.ABANDONED,
      abandonedAt: new Date('2026-09-10T10:02:00Z'),
    });

    expect(() => session.complete()).toThrow(InvalidStateTransitionError);
  });

  it('rejects cross-terminal transition from COMPLETED to ABANDONED', () => {
    const session = new RecallSession({
      ...sampleProps,
      status: SessionStatus.COMPLETED,
      completedAt: new Date('2026-09-10T10:05:00Z'),
    });

    expect(() => session.abandon()).toThrow(InvalidStateTransitionError);
  });

  it('advances prompt cursor and updates active prompt snapshot', () => {
    const session = new RecallSession(sampleProps);
    const nextStartedAt = new Date('2026-09-10T10:01:00Z');

    session.advanceCursor({
      nextPromptIndex: 1,
      nextCardKey: 'NEXT_STOP::stop_1->stop_2',
      nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
      nextExpectedAnswer: 'stop_2',
      nextPromptStartedAt: nextStartedAt,
    });

    expect(session.currentPromptIndex).toBe(1);
    expect(session.currentCardKey).toBe('NEXT_STOP::stop_1->stop_2');
    expect(session.currentRecallMode).toBe(RecallMode.NEXT_STOP_FORWARD);
    expect(session.currentExpectedAnswer).toBe('stop_2');
    expect(session.currentPromptStartedAt).toEqual(nextStartedAt);
  });

  it('rejects cursor advancement if session is in a terminal state', () => {
    const session = new RecallSession({
      ...sampleProps,
      status: SessionStatus.COMPLETED,
      completedAt: new Date('2026-09-10T10:05:00Z'),
    });

    expect(() =>
      session.advanceCursor({
        nextPromptIndex: 1,
        nextCardKey: 'NEXT_STOP::stop_1->stop_2',
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'stop_2',
        nextPromptStartedAt: new Date(),
      })
    ).toThrow(InvalidStateTransitionError);
  });
});

describe('RecallSession Domain Flow & Invariants (Change 08 Phase 1)', () => {
  const authoritativeNow = new Date('2026-09-11T10:00:00Z');
  const validPlannedCards = ['card-1', 'card-2', 'card-3'];

  const createValidSessionProps = () => ({
    id: 'session-c08',
    driverId: 'driver-1',
    routeId: 'R66',
    targetVariantKey: 'R66_DIR0_var1',
    status: SessionStatus.IN_PROGRESS,
    currentPromptIndex: 0,
    currentCardKey: null,
    currentRecallMode: null,
    currentExpectedAnswer: null,
    currentPromptStartedAt: null,
    startedAt: authoritativeNow,
    completedAt: null,
    abandonedAt: null,
    plannedCardIds: validPlannedCards,
  });

  // 1. 建立 session → IN_PROGRESS, cursor = 0, plannedCardIds frozen
  it('1. initializes session in IN_PROGRESS with cursor = 0 and frozen plannedCardIds', () => {
    const session = new RecallSession(createValidSessionProps());
    expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session.currentPromptIndex).toBe(0);
    expect(session.plannedCardIds).toEqual(validPlannedCards);
  });

  // 2. plannedCardIds = [] → RecallSessionCannotBeEmptyError
  it('2. throws RecallSessionCannotBeEmptyError when plannedCardIds is empty', () => {
    expect(
      () =>
        new RecallSession({
          ...createValidSessionProps(),
          plannedCardIds: [],
        })
    ).toThrow(RecallSessionCannotBeEmptyError);
  });

  // 3. plannedCardIds 有 duplicate → reject
  it('3. rejects plannedCardIds containing duplicates', () => {
    expect(
      () =>
        new RecallSession({
          ...createValidSessionProps(),
          plannedCardIds: ['card-1', 'card-2', 'card-1'],
        })
    ).toThrow(DuplicateCardInSessionError);
  });

  // 4. advance(now) → 0 -> 1 -> 2 ...
  it('4. advances monotonically through planned cards (0 -> 1 -> 2)', () => {
    const session = new RecallSession(createValidSessionProps());
    const t1 = new Date('2026-09-11T10:01:00Z');
    session.advance(t1);
    expect(session.currentPromptIndex).toBe(1);
    expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session.currentPromptStartedAt).toBeNull();

    const t2 = new Date('2026-09-11T10:02:00Z');
    session.advance(t2);
    expect(session.currentPromptIndex).toBe(2);
    expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session.currentPromptStartedAt).toBeNull();
  });

  // 5. advance(now) 到最後一題 → cursor = N, status = COMPLETED, completedAt = authoritativeNow, currentPromptStartedAt = null
  it('5. transitions to COMPLETED when advancing past the final card (cursor = N)', () => {
    const session = new RecallSession(createValidSessionProps());
    session.advance(new Date('2026-09-11T10:01:00Z')); // 0 -> 1
    session.advance(new Date('2026-09-11T10:02:00Z')); // 1 -> 2

    const completionNow = new Date('2026-09-11T10:03:00Z');
    session.advance(completionNow); // 2 -> 3 (N)

    expect(session.currentPromptIndex).toBe(3);
    expect(session.status).toBe(SessionStatus.COMPLETED);
    expect(session.completedAt).toEqual(completionNow);
    expect(session.currentPromptStartedAt).toBeNull();
  });

  // 6. COMPLETED 後不能 advance
  it('6. throws InvalidStateTransitionError when advance is called on COMPLETED session', () => {
    const session = new RecallSession({
      ...createValidSessionProps(),
      status: SessionStatus.COMPLETED,
      currentPromptIndex: 3,
      completedAt: authoritativeNow,
    });

    expect(() => session.advance(new Date())).toThrow(InvalidStateTransitionError);
  });

  // 7. ABANDONED → status = ABANDONED, abandonedAt = authoritativeNow, cursor 不變
  it('7. transitions to ABANDONED with authoritative timestamp and freezes cursor', () => {
    const session = new RecallSession({
      ...createValidSessionProps(),
      currentPromptIndex: 1,
    });
    const abandonNow = new Date('2026-09-11T10:05:00Z');
    session.abandon(abandonNow);

    expect(session.status).toBe(SessionStatus.ABANDONED);
    expect(session.abandonedAt).toEqual(abandonNow);
    expect(session.currentPromptIndex).toBe(1);
    expect(session.currentPromptStartedAt).toBeNull();
  });

  // 8. ABANDONED 後不能 advance
  it('8. throws InvalidStateTransitionError when advance is called on ABANDONED session', () => {
    const session = new RecallSession({
      ...createValidSessionProps(),
      status: SessionStatus.ABANDONED,
      currentPromptIndex: 1,
      abandonedAt: authoritativeNow,
    });

    expect(() => session.advance(new Date())).toThrow(InvalidStateTransitionError);
  });

  // 9. terminal state 不允許再次 transition
  it('9. prohibits cross-transition between terminal states (COMPLETED <-> ABANDONED)', () => {
    const completedSession = new RecallSession({
      ...createValidSessionProps(),
      status: SessionStatus.COMPLETED,
      currentPromptIndex: 3,
      completedAt: authoritativeNow,
    });
    expect(() => completedSession.abandon(new Date())).toThrow(InvalidStateTransitionError);

    const abandonedSession = new RecallSession({
      ...createValidSessionProps(),
      status: SessionStatus.ABANDONED,
      currentPromptIndex: 1,
      abandonedAt: authoritativeNow,
    });
    expect(() => abandonedSession.complete(new Date())).toThrow(InvalidStateTransitionError);
  });

  // 10. createdAt / completedAt / abandonedAt → 使用 injected Date，不自行 new Date()
  it('10. records exactly the provided authoritative timestamps without internal default fallback', () => {
    const customStartedAt = new Date('2026-09-11T08:00:00Z');
    const session = new RecallSession({
      ...createValidSessionProps(),
      startedAt: customStartedAt,
    });
    expect(session.startedAt).toEqual(customStartedAt);

    const customAbandonTime = new Date('2026-09-11T08:30:00Z');
    session.abandon(customAbandonTime);
    expect(session.abandonedAt).toEqual(customAbandonTime);
  });
});
