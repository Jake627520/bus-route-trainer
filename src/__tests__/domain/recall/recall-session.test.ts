import { describe, it, expect } from 'vitest';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
  InvalidStateTransitionError,
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
