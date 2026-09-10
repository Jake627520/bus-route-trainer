import { describe, it, expect } from 'vitest';
import { RecallMode, RecallOutcome } from '@/domain/recall/recall-session';
import { RecallPrompt } from '@/domain/recall/recall-prompt';
import { DriverAnswer } from '@/domain/recall/driver-answer';
import { RecallAttempt } from '@/domain/recall/recall-attempt';

describe('RecallPrompt & RecallAttempt Domain Unit Tests', () => {
  it('creates an immutable RecallPrompt projection', () => {
    const prompt = new RecallPrompt({
      promptId: 'prompt-1',
      sessionId: 'session-123',
      cardKey: 'NEXT_STOP::stop_a->stop_b',
      promptIndex: 0,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      givenReference: 'Stop A',
      expectedAnswer: 'stop_b',
      createdAt: new Date('2026-09-10T10:00:00Z'),
    });

    expect(prompt.promptId).toBe('prompt-1');
    expect(prompt.cardKey).toBe('NEXT_STOP::stop_a->stop_b');
    expect(prompt.promptIndex).toBe(0);
    expect(prompt.recallMode).toBe(RecallMode.NEXT_STOP_FORWARD);
    expect(prompt.givenReference).toBe('Stop A');
    expect(prompt.expectedAnswer).toBe('stop_b');
  });

  it('creates a DriverAnswer value object', () => {
    const answer = new DriverAnswer({
      sessionId: 'session-123',
      promptIndex: 0,
      rawInput: 'stop_b',
      submittedAt: new Date('2026-09-10T10:00:05Z'),
    });

    expect(answer.sessionId).toBe('session-123');
    expect(answer.promptIndex).toBe(0);
    expect(answer.rawInput).toBe('stop_b');
  });

  it('calculates durationMs server-side from startedAt and answeredAt', () => {
    const startedAt = new Date('2026-09-10T10:00:00Z');
    const answeredAt = new Date('2026-09-10T10:00:04.250Z');

    const attempt = new RecallAttempt({
      id: 'attempt-1',
      sessionId: 'session-123',
      promptIndex: 0,
      cardKey: 'NEXT_STOP::stop_a->stop_b',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_b',
      expectedAnswer: 'stop_b',
      outcome: RecallOutcome.PASS,
      startedAt,
      answeredAt,
    });

    expect(attempt.durationMs).toBe(4250);
    expect(attempt.outcome).toBe(RecallOutcome.PASS);
    expect(attempt.promptIndex).toBe(0);
  });
});
