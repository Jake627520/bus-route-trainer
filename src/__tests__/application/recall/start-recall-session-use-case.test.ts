import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StartRecallSessionUseCase,
  VariantNotEnrolledError,
} from '../../../application/recall/start-recall-session-use-case';
import { RecallRepository } from '../../../application/recall/recall-repository.port';
import { LearningProgressRepository } from '../../../application/learning/learning-progress-repository.port';
import { GetRouteVariantsUseCase } from '../../../application/gtfs/get-route-variants-use-case';
import { RouteVariantDto } from '../../../application/gtfs/gtfs-read-repository.port';
import { PromptSelectionStrategy } from '../../../domain/recall/prompt-selection-strategy';
import { RecallSession, SessionStatus, RecallMode } from '../../../domain/recall/recall-session';
import { RecallPrompt } from '../../../domain/recall/recall-prompt';
import { DriverVariantProgress, ProgressStatus } from '../../../domain/learning/driver-variant-progress';
import { LearningCard, CardType } from '../../../domain/learning/learning-card';
import { DEFAULT_DRIVER_ID } from '../../../application/learning/auth-constants';

describe('StartRecallSessionUseCase Unit Tests', () => {
  let recallRepo: RecallRepository;
  let learningRepo: LearningProgressRepository;
  let getRouteVariantsUseCase: GetRouteVariantsUseCase;
  let promptStrategy: PromptSelectionStrategy;
  let useCase: StartRecallSessionUseCase;

  const sampleVariantKey = 'route-66:0:hash123';
  const sampleRouteId = 'route-66';

  const sampleTopology: RouteVariantDto = {
    variantKey: sampleVariantKey,
    routeId: sampleRouteId,
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
    routeId: sampleRouteId,
    directionId: 0,
    targetVariantKey: sampleVariantKey,
    status: ProgressStatus.IN_PROGRESS,
    cards: [
      new LearningCard({
        id: 'c1',
        progressId: 'prog-1',
        cardKey: 'STOP::stop_1',
        cardType: CardType.STOP,
      }),
    ],
  });

  const mockPrompt = new RecallPrompt({
    promptId: 'p-1',
    sessionId: 'sess-placeholder',
    cardKey: 'NEXT_STOP::stop_1->stop_2',
    promptIndex: 0,
    recallMode: RecallMode.NEXT_STOP_FORWARD,
    givenReference: 'Station 1',
    expectedAnswer: 'stop_2',
    createdAt: new Date(),
  });

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

    learningRepo = {
      findByDriverAndVariant: vi.fn(),
      findById: vi.fn(),
      saveProgressWithCards: vi.fn(),
    };

    getRouteVariantsUseCase = {
      execute: vi.fn().mockResolvedValue([sampleTopology]),
    } as unknown as GetRouteVariantsUseCase;

    promptStrategy = {
      selectNextPrompt: vi.fn().mockReturnValue(mockPrompt),
    };

    useCase = new StartRecallSessionUseCase(
      recallRepo,
      learningRepo,
      getRouteVariantsUseCase,
      promptStrategy,
    );
  });

  it('(1) verifies driver enrollment and rejects unenrolled variants with VariantNotEnrolledError', async () => {
    vi.mocked(learningRepo.findByDriverAndVariant).mockResolvedValue(null);

    await expect(
      useCase.execute({
        routeId: sampleRouteId,
        variantKey: sampleVariantKey,
      }),
    ).rejects.toThrow(VariantNotEnrolledError);
  });

  it('(2) re-attaches idempotently and returns existing active session if one exists', async () => {
    vi.mocked(learningRepo.findByDriverAndVariant).mockResolvedValue(sampleProgress);

    const existingSession = new RecallSession({
      id: 'existing-sess-1',
      driverId: DEFAULT_DRIVER_ID,
      routeId: sampleRouteId,
      targetVariantKey: sampleVariantKey,
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 1,
      currentCardKey: 'NEXT_STOP::stop_2->stop_3',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: 'stop_3',
      currentPromptStartedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: null,
    });
    vi.mocked(recallRepo.findActiveSession).mockResolvedValue(existingSession);

    const result = await useCase.execute({
      routeId: sampleRouteId,
      variantKey: sampleVariantKey,
    });

    expect(result.isNew).toBe(false);
    expect(result.session.id).toBe('existing-sess-1');
    expect(recallRepo.createSession).not.toHaveBeenCalled();
  });

  it('(3) creates new session with initial prompt snapshot when no active session exists', async () => {
    vi.mocked(learningRepo.findByDriverAndVariant).mockResolvedValue(sampleProgress);
    vi.mocked(recallRepo.findActiveSession).mockResolvedValue(null);
    vi.mocked(recallRepo.createSession).mockImplementation(async (s) => s);

    const result = await useCase.execute({
      routeId: sampleRouteId,
      variantKey: sampleVariantKey,
    });

    expect(result.isNew).toBe(true);
    expect(result.session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(result.session.currentPromptIndex).toBe(0);
    expect(result.session.currentCardKey).toBe('NEXT_STOP::stop_1->stop_2');
    expect(recallRepo.createSession).toHaveBeenCalled();
    const createdSession = vi.mocked(recallRepo.createSession).mock.calls[0][0];
    expect(createdSession.currentExpectedAnswer).toBe('stop_2');
  });

  it('(4) catches P2002 active session race condition and returns winning session', async () => {
    vi.mocked(learningRepo.findByDriverAndVariant).mockResolvedValue(sampleProgress);
    vi.mocked(recallRepo.findActiveSession).mockResolvedValueOnce(null);

    const winningSession = new RecallSession({
      id: 'winning-sess',
      driverId: DEFAULT_DRIVER_ID,
      routeId: sampleRouteId,
      targetVariantKey: sampleVariantKey,
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: 'NEXT_STOP::stop_1->stop_2',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: 'stop_2',
      currentPromptStartedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: null,
    });

    const p2002Error = Object.assign(
      new Error('Unique constraint failed on the fields: (`driverId`,`targetVariantKey`)'),
      { code: 'P2002', meta: { target: ['driverId', 'targetVariantKey'] } },
    );

    vi.mocked(recallRepo.createSession).mockRejectedValueOnce(p2002Error);
    vi.mocked(recallRepo.findActiveSession).mockResolvedValueOnce(winningSession);

    const result = await useCase.execute({
      routeId: sampleRouteId,
      variantKey: sampleVariantKey,
    });

    expect(result.isNew).toBe(false);
    expect(result.session.id).toBe('winning-sess');
  });

  it('(5) rethrows unrelated P2002 or general errors', async () => {
    vi.mocked(learningRepo.findByDriverAndVariant).mockResolvedValue(sampleProgress);
    vi.mocked(recallRepo.findActiveSession).mockResolvedValue(null);

    const unrelatedError = new Error('Database disk full');
    vi.mocked(recallRepo.createSession).mockRejectedValueOnce(unrelatedError);

    await expect(
      useCase.execute({
        routeId: sampleRouteId,
        variantKey: sampleVariantKey,
      }),
    ).rejects.toThrow('Database disk full');
  });
});
