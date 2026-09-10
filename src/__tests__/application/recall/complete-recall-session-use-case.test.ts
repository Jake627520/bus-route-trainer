import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompleteRecallSessionUseCase } from '../../../application/recall/complete-recall-session-use-case';
import { SessionNotFoundError } from '../../../application/recall/get-current-recall-prompt-use-case';
import { RecallRepository } from '../../../application/recall/recall-repository.port';
import {
  RecallSession,
  SessionStatus,
  InvalidStateTransitionError,
} from '../../../domain/recall/recall-session';

describe('CompleteRecallSessionUseCase Unit Tests', () => {
  let recallRepo: RecallRepository;
  let useCase: CompleteRecallSessionUseCase;

  const sampleStartedAt = new Date('2026-09-10T10:00:00Z');

  const createActiveSession = () => {
    return new RecallSession({
      id: 'session-complete-1',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 2,
      currentCardKey: 'NEXT_STOP::s2->s3',
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: sampleStartedAt,
      completedAt: null,
      abandonedAt: null,
    });
  };

  beforeEach(() => {
    recallRepo = {
      findActiveSession: vi.fn(),
      findById: vi.fn(),
      findAttemptBySessionAndIndex: vi.fn(),
      findAttemptsBySessionId: vi.fn(),
      createSession: vi.fn(),
      saveAttemptAndAdvanceSession: vi.fn(),
      updateSessionStatus: vi.fn().mockImplementation(async (s) => s),
    };
    useCase = new CompleteRecallSessionUseCase(recallRepo);
  });

  it('throws SessionNotFoundError if session is not found', async () => {
    vi.mocked(recallRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        sessionId: 'nonexistent',
        action: 'COMPLETE',
      }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('completes an IN_PROGRESS session and clears active snapshot', async () => {
    const session = createActiveSession();
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    const result = await useCase.execute({
      sessionId: 'session-complete-1',
      action: 'COMPLETE',
    });

    expect(result.session.status).toBe(SessionStatus.COMPLETED);
    expect(result.session.completedAt).not.toBeNull();
    expect(recallRepo.updateSessionStatus).toHaveBeenCalled();
  });

  it('abandons an IN_PROGRESS session and clears active snapshot', async () => {
    const session = createActiveSession();
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    const result = await useCase.execute({
      sessionId: 'session-complete-1',
      action: 'ABANDON',
    });

    expect(result.session.status).toBe(SessionStatus.ABANDONED);
    expect(result.session.abandonedAt).not.toBeNull();
    expect(recallRepo.updateSessionStatus).toHaveBeenCalled();
  });

  it('allows idempotent COMPLETE on already COMPLETED session', async () => {
    const completedAt = new Date('2026-09-10T10:05:00Z');
    const session = new RecallSession({
      id: 'session-already-completed',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.COMPLETED,
      currentPromptIndex: 3,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: sampleStartedAt,
      completedAt,
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    const result = await useCase.execute({
      sessionId: 'session-already-completed',
      action: 'COMPLETE',
    });

    expect(result.session.status).toBe(SessionStatus.COMPLETED);
    expect(result.session.completedAt).toEqual(completedAt);
    expect(recallRepo.updateSessionStatus).toHaveBeenCalled();
  });

  it('allows idempotent ABANDON on already ABANDONED session', async () => {
    const abandonedAt = new Date('2026-09-10T10:03:00Z');
    const session = new RecallSession({
      id: 'session-already-abandoned',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.ABANDONED,
      currentPromptIndex: 1,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: sampleStartedAt,
      completedAt: null,
      abandonedAt,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    const result = await useCase.execute({
      sessionId: 'session-already-abandoned',
      action: 'ABANDON',
    });

    expect(result.session.status).toBe(SessionStatus.ABANDONED);
    expect(result.session.abandonedAt).toEqual(abandonedAt);
  });

  it('rejects cross-terminal transition from ABANDONED to COMPLETE with InvalidStateTransitionError', async () => {
    const session = new RecallSession({
      id: 'session-abandoned',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.ABANDONED,
      currentPromptIndex: 1,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: sampleStartedAt,
      completedAt: null,
      abandonedAt: new Date(),
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    await expect(
      useCase.execute({
        sessionId: 'session-abandoned',
        action: 'COMPLETE',
      }),
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it('rejects cross-terminal transition from COMPLETED to ABANDON with InvalidStateTransitionError', async () => {
    const session = new RecallSession({
      id: 'session-completed',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.COMPLETED,
      currentPromptIndex: 3,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: sampleStartedAt,
      completedAt: new Date(),
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    await expect(
      useCase.execute({
        sessionId: 'session-completed',
        action: 'ABANDON',
      }),
    ).rejects.toThrow(InvalidStateTransitionError);
  });
});
