import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SubmitRecallAnswerUseCase,
  PromptIndexMismatchError,
} from '../../../application/recall/submit-recall-answer-use-case';
import { SessionNotActiveError } from '../../../application/recall/get-current-recall-prompt-use-case';
import { RecallRepository } from '../../../application/recall/recall-repository.port';
import { LearningProgressRepository } from '../../../application/learning/learning-progress-repository.port';
import { GetRouteVariantsUseCase } from '../../../application/gtfs/get-route-variants-use-case';
import { PromptSelectionStrategy } from '../../../domain/recall/prompt-selection-strategy';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
  RecallOutcome,
} from '../../../domain/recall/recall-session';
import { RecallAttempt } from '../../../domain/recall/recall-attempt';
import { RecallPrompt } from '../../../domain/recall/recall-prompt';
import { RouteVariantDto } from '../../../application/gtfs/gtfs-read-repository.port';
import { DriverVariantProgress, ProgressStatus } from '../../../domain/learning/driver-variant-progress';
import { DEFAULT_DRIVER_ID } from '../../../application/learning/auth-constants';

describe('SubmitRecallAnswerUseCase Unit Tests', () => {
  let recallRepo: RecallRepository;
  let learningRepo: LearningProgressRepository;
  let getRouteVariantsUseCase: GetRouteVariantsUseCase;
  let promptStrategy: PromptSelectionStrategy;
  let useCase: SubmitRecallAnswerUseCase;

  const sampleStartedAt = new Date('2026-09-10T10:00:00Z');

  const createActiveSession = (currentPromptIndex = 0, expected = 'stop_2') => {
    return new RecallSession({
      id: 'session-submit-1',
      driverId: DEFAULT_DRIVER_ID,
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex,
      currentCardKey: 'NEXT_STOP::stop_1->stop_2',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: expected,
      currentPromptStartedAt: sampleStartedAt,
      startedAt: sampleStartedAt,
      completedAt: null,
      abandonedAt: null,
    });
  };

  const sampleTopology: RouteVariantDto = {
    variantKey: 'var-66',
    routeId: 'route-66',
    directionId: 0,
    headsign: 'City',
    stopCount: 3,
    sampleTripId: 'trip-1',
    tripCount: 1,
    orderedStops: [
      { stopSequence: 1, stopId: 'stop_1', stopName: 'Station 1', isTimepoint: false },
      { stopSequence: 2, stopId: 'stop_2', stopName: 'Station 2', isTimepoint: false },
      { stopSequence: 3, stopId: 'stop_3', stopName: 'Station 3', isTimepoint: false },
    ],
  };

  const sampleProgress = new DriverVariantProgress({
    id: 'prog-1',
    driverId: DEFAULT_DRIVER_ID,
    routeId: 'route-66',
    directionId: 0,
    targetVariantKey: 'var-66',
    status: ProgressStatus.IN_PROGRESS,
    cards: [],
  });

  beforeEach(() => {
    recallRepo = {
      findActiveSession: vi.fn(),
      findById: vi.fn(),
      findAttemptBySessionAndIndex: vi.fn(),
      findAttemptsBySessionId: vi.fn(),
      createSession: vi.fn(),
      saveAttemptAndAdvanceSession: vi.fn().mockImplementation(async (attempt, session) => ({
        attempt,
        session,
      })),
      updateSessionStatus: vi.fn(),
    };

    learningRepo = {
      findByDriverAndVariant: vi.fn().mockResolvedValue(sampleProgress),
      findById: vi.fn(),
      saveProgressWithCards: vi.fn(),
    };

    getRouteVariantsUseCase = {
      execute: vi.fn().mockResolvedValue([sampleTopology]),
    } as unknown as GetRouteVariantsUseCase;

    promptStrategy = {
      selectNextPrompt: vi.fn(),
    };

    useCase = new SubmitRecallAnswerUseCase(
      recallRepo,
      learningRepo,
      getRouteVariantsUseCase,
      promptStrategy,
    );
  });

  it('(1) performs deterministic evaluation against prompt snapshot and records PASS', async () => {
    const session = createActiveSession(0, 'stop_2');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(null);

    const nextPrompt = new RecallPrompt({
      promptId: 'p-2',
      sessionId: session.id,
      cardKey: 'NEXT_STOP::stop_2->stop_3',
      promptIndex: 1,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      givenReference: 'Station 2',
      expectedAnswer: 'stop_3',
      createdAt: new Date(),
    });
    vi.mocked(promptStrategy.selectNextPrompt).mockReturnValue(nextPrompt);

    const result = await useCase.execute({
      sessionId: 'session-submit-1',
      promptIndex: 0,
      rawInput: 'stop_2',
    });

    expect(result.outcome).toBe(RecallOutcome.PASS);
    expect(result.promptIndex).toBe(0);
    expect(result.isSessionCompleted).toBe(false);

    expect(recallRepo.saveAttemptAndAdvanceSession).toHaveBeenCalled();
    const [savedAttempt, updatedSession] = vi.mocked(
      recallRepo.saveAttemptAndAdvanceSession,
    ).mock.calls[0];

    expect(savedAttempt.outcome).toBe(RecallOutcome.PASS);
    expect(savedAttempt.expectedAnswer).toBe('stop_2');
    expect(savedAttempt.rawInput).toBe('stop_2');
    expect(updatedSession.currentPromptIndex).toBe(1);
    expect(updatedSession.currentCardKey).toBe('NEXT_STOP::stop_2->stop_3');
  });

  it('(2) snapshot immutability invariant: evaluates against snapshot even if GTFS is empty/unavailable', async () => {
    const session = createActiveSession(0, 'stop_2');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(null);

    // GTFS topology returns empty (e.g. feed changed or deleted)
    vi.mocked(getRouteVariantsUseCase.execute).mockResolvedValue([]);
    vi.mocked(promptStrategy.selectNextPrompt).mockReturnValue(null);

    const result = await useCase.execute({
      sessionId: 'session-submit-1',
      promptIndex: 0,
      rawInput: 'stop_2',
    });

    // Evaluation succeeds using snapshot answer 'stop_2'!
    expect(result.outcome).toBe(RecallOutcome.PASS);
    expect(result.isSessionCompleted).toBe(true);
  });

  it('(3) idempotency guard: returns existing outcome on repeated submission of same promptIndex', async () => {
    const session = createActiveSession(1, 'stop_3');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);

    const existingAttempt = new RecallAttempt({
      id: 'existing-att-0',
      sessionId: session.id,
      promptIndex: 0,
      cardKey: 'NEXT_STOP::stop_1->stop_2',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_2',
      expectedAnswer: 'stop_2',
      outcome: RecallOutcome.PASS,
      startedAt: sampleStartedAt,
      answeredAt: new Date(sampleStartedAt.getTime() + 2000),
      durationMs: 2000,
    });

    // Attempt 0 already exists in DB
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(existingAttempt);

    const result = await useCase.execute({
      sessionId: 'session-submit-1',
      promptIndex: 0,
      rawInput: 'stop_2',
    });

    expect(result.outcome).toBe(RecallOutcome.PASS);
    expect(result.promptIndex).toBe(0);
    // Did NOT call saveAttemptAndAdvanceSession
    expect(recallRepo.saveAttemptAndAdvanceSession).not.toHaveBeenCalled();
  });

  it('(4) rejects promptIndex mismatch if submitted index is neither existing attempt nor currentPromptIndex', async () => {
    const session = createActiveSession(0, 'stop_2');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(null);

    await expect(
      useCase.execute({
        sessionId: 'session-submit-1',
        promptIndex: 5, // future index!
        rawInput: 'stop_6',
      }),
    ).rejects.toThrow(PromptIndexMismatchError);
  });

  it('(5) transitions session to COMPLETED upon final prompt submission', async () => {
    const session = createActiveSession(1, 'stop_3');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(null);

    // Strategy returns null -> no further prompts
    vi.mocked(promptStrategy.selectNextPrompt).mockReturnValue(null);

    const result = await useCase.execute({
      sessionId: 'session-submit-1',
      promptIndex: 1,
      rawInput: 'wrong_stop',
    });

    expect(result.outcome).toBe(RecallOutcome.FAIL);
    expect(result.isSessionCompleted).toBe(true);

    const [, updatedSession] = vi.mocked(
      recallRepo.saveAttemptAndAdvanceSession,
    ).mock.calls[0];

    expect(updatedSession.status).toBe(SessionStatus.COMPLETED);
    expect(updatedSession.completedAt).not.toBeNull();
  });

  it('(6) rejects submission on terminal session with SessionNotActiveError', async () => {
    const completedSession = new RecallSession({
      id: 'completed-sess',
      driverId: DEFAULT_DRIVER_ID,
      routeId: 'route-66',
      targetVariantKey: 'var-66',
      status: SessionStatus.COMPLETED,
      currentPromptIndex: 2,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: sampleStartedAt,
      completedAt: new Date(),
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findById).mockResolvedValue(completedSession);
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(null);

    await expect(
      useCase.execute({
        sessionId: 'completed-sess',
        promptIndex: 2,
        rawInput: 'stop_3',
      }),
    ).rejects.toThrow(SessionNotActiveError);
  });

  it('(7) catches P2002 race condition on concurrent attempt insertion and recovers idempotently with existing attempt', async () => {
    const session = createActiveSession(0, 'stop_2');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);
    // Initially not found by findAttemptBySessionAndIndex (both concurrent requests read null)
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValueOnce(null);

    const winningAttempt = new RecallAttempt({
      id: 'winning-attempt-0',
      sessionId: session.id,
      promptIndex: 0,
      cardKey: 'NEXT_STOP::stop_1->stop_2',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_2',
      expectedAnswer: 'stop_2',
      outcome: RecallOutcome.PASS,
      startedAt: sampleStartedAt,
      answeredAt: new Date(sampleStartedAt.getTime() + 1000),
      durationMs: 1000,
    });

    const p2002Error = Object.assign(
      new Error('Unique constraint failed on the fields: (`sessionId`,`promptIndex`)'),
      { code: 'P2002', meta: { target: ['sessionId', 'promptIndex'] } },
    );

    // saveAttemptAndAdvanceSession fails with P2002 (simulating race collision)
    vi.mocked(recallRepo.saveAttemptAndAdvanceSession).mockRejectedValueOnce(p2002Error);
    // During recovery, findAttemptBySessionAndIndex finds the attempt inserted by the concurrent request
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValueOnce(winningAttempt);

    const result = await useCase.execute({
      sessionId: 'session-submit-1',
      promptIndex: 0,
      rawInput: 'stop_2',
    });

    expect(result.outcome).toBe(RecallOutcome.PASS);
    expect(result.promptIndex).toBe(0);
  });

  it('(8) rethrows unrelated P2002 or unexpected errors during saveAttemptAndAdvanceSession', async () => {
    const session = createActiveSession(0, 'stop_2');
    vi.mocked(recallRepo.findById).mockResolvedValue(session);
    vi.mocked(recallRepo.findAttemptBySessionAndIndex).mockResolvedValue(null);

    const unrelatedError = new Error('Disk failure');
    vi.mocked(recallRepo.saveAttemptAndAdvanceSession).mockRejectedValueOnce(unrelatedError);

    await expect(
      useCase.execute({
        sessionId: 'session-submit-1',
        promptIndex: 0,
        rawInput: 'stop_2',
      }),
    ).rejects.toThrow('Disk failure');
  });
});
