import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GetCurrentRecallPromptUseCase,
  SessionNotFoundError,
  SessionNotActiveError,
} from '../../../application/recall/get-current-recall-prompt-use-case';
import { RecallRepository } from '../../../application/recall/recall-repository.port';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
} from '../../../domain/recall/recall-session';

describe('GetCurrentRecallPromptUseCase Unit Tests', () => {
  let recallRepo: RecallRepository;
  let useCase: GetCurrentRecallPromptUseCase;

  beforeEach(() => {
    recallRepo = {
      findActiveSession: vi.fn(),
      findById: vi.fn(),
      findAttemptBySessionAndIndex: vi.fn(),
      findAttemptsBySessionId: vi.fn(),
      createSession: vi.fn(),
      saveAttemptAndAdvanceSession: vi.fn(),
      updateSessionStatus: vi.fn(),
    };
    useCase = new GetCurrentRecallPromptUseCase(recallRepo);
  });

  it('throws SessionNotFoundError if session does not exist', async () => {
    vi.mocked(recallRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ sessionId: 'nonexistent-session' }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('throws SessionNotActiveError if session is COMPLETED', async () => {
    const completedSession = new RecallSession({
      id: 'completed-sess',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-key',
      status: SessionStatus.COMPLETED,
      currentPromptIndex: 2,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: new Date(),
      completedAt: new Date(),
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(completedSession);

    await expect(
      useCase.execute({ sessionId: 'completed-sess' }),
    ).rejects.toThrow(SessionNotActiveError);
  });

  it('throws SessionNotActiveError if session is ABANDONED', async () => {
    const abandonedSession = new RecallSession({
      id: 'abandoned-sess',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-key',
      status: SessionStatus.ABANDONED,
      currentPromptIndex: 1,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: new Date(),
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(abandonedSession);

    await expect(
      useCase.execute({ sessionId: 'abandoned-sess' }),
    ).rejects.toThrow(SessionNotActiveError);
  });

  it('reconstitutes prompt projection from session prompt snapshot and hides expectedAnswer', async () => {
    const startedAt = new Date('2026-09-10T10:00:00Z');
    const activeSession = new RecallSession({
      id: 'active-sess-1',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-key',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: 'NEXT_STOP::stop_1->stop_2',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: 'stop_2', // Must be hidden from client
      currentPromptStartedAt: startedAt,
      startedAt,
      completedAt: null,
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(activeSession);

    const result = await useCase.execute({ sessionId: 'active-sess-1' });

    expect(result.prompt).not.toBeNull();
    expect(result.prompt?.sessionId).toBe('active-sess-1');
    expect(result.prompt?.promptIndex).toBe(0);
    expect(result.prompt?.cardKey).toBe('NEXT_STOP::stop_1->stop_2');
    expect(result.prompt?.recallMode).toBe(RecallMode.NEXT_STOP_FORWARD);
    expect(result.prompt?.givenReference).toBe('stop_1');
    expect(result.prompt?.startedAt).toEqual(startedAt);

    // CRITICAL: expectedAnswer must NEVER be present in the client DTO
    expect((result.prompt as unknown as Record<string, unknown>).expectedAnswer).toBeUndefined();
  });

  it('returns null prompt if session has no active prompt snapshot', async () => {
    const activeSession = new RecallSession({
      id: 'active-sess-empty',
      driverId: 'driver-1',
      routeId: 'route-66',
      targetVariantKey: 'var-key',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(activeSession);

    const result = await useCase.execute({ sessionId: 'active-sess-empty' });
    expect(result.prompt).toBeNull();
  });
});
