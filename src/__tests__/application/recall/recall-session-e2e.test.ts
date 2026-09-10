import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ImportGtfsUseCase } from '@/application/gtfs/import-gtfs-use-case';
import { PrismaGtfsRepository } from '@/infrastructure/gtfs/importer/prisma-gtfs-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { EnrollVariantUseCase } from '@/application/learning/enroll-variant-use-case';
import { PrismaRecallRepository } from '@/infrastructure/recall/prisma-recall-repository';
import { StartRecallSessionUseCase } from '@/application/recall/start-recall-session-use-case';
import { GetCurrentRecallPromptUseCase } from '@/application/recall/get-current-recall-prompt-use-case';
import { SubmitRecallAnswerUseCase } from '@/application/recall/submit-recall-answer-use-case';
import { CompleteRecallSessionUseCase } from '@/application/recall/complete-recall-session-use-case';
import {
  RecallMode,
  RecallOutcome,
  SessionStatus,
} from '@/domain/recall/recall-session';
import { SequentialTopologyPromptStrategy } from '@/domain/recall/prompt-selection-strategy';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

describe('Change 05 Recall Session Domain End-to-End Vertical Slice Integration', () => {
  const prisma = new PrismaClient();
  const writeRepo = new PrismaGtfsRepository(prisma);
  const readRepo = new PrismaGtfsReadRepository(prisma);
  const importer = new ImportGtfsUseCase(writeRepo);
  const getRouteVariantsUseCase = new GetRouteVariantsUseCase(readRepo);

  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const enrollUseCase = new EnrollVariantUseCase(learningRepo, getRouteVariantsUseCase);

  const recallRepo = new PrismaRecallRepository(prisma);
  const nextStopStrategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
  const stopNameStrategy = new SequentialTopologyPromptStrategy(RecallMode.STOP_NAME_RECOGNITION);

  const startSessionUseCase = new StartRecallSessionUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    nextStopStrategy,
  );
  const getPromptUseCase = new GetCurrentRecallPromptUseCase(recallRepo);
  const submitAnswerUseCase = new SubmitRecallAnswerUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    nextStopStrategy,
  );
  const completeSessionUseCase = new CompleteRecallSessionUseCase(recallRepo);

  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/gtfs');
  const validFeedDir = path.join(fixturesDir, 'valid-feed');

  let targetVariantKey: string;
  let routeId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // 1. Clean all tables
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();

    // 2. Ingest GTFS valid-feed
    const report = await importer.execute(validFeedDir);
    expect(report.routesCount).toBe(1);

    // 3. Find route variant key
    const routes = await readRepo.findAllRoutes();
    routeId = routes[0].id;
    const variants = await getRouteVariantsUseCase.execute(routeId);
    expect(variants.length).toBeGreaterThan(0);
    targetVariantKey = variants[0].variantKey;

    // 4. Enroll driver in the variant
    const enrollResult = await enrollUseCase.execute({
      routeId,
      variantKey: targetVariantKey,
    });
    expect(enrollResult.progress.targetVariantKey).toBe(targetVariantKey);
  });

  afterAll(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsCalendarDate.deleteMany();
    await prisma.gtfsCalendar.deleteMany();
    await prisma.gtfsAgency.deleteMany();
    await prisma.$disconnect();
  });

  it('runs complete training cycle in NEXT_STOP_FORWARD mode from start to completion', async () => {
    // 1. Start recall session
    const startResult = await startSessionUseCase.execute({
      routeId,
      variantKey: targetVariantKey,
    });
    expect(startResult.isNew).toBe(true);
    expect(startResult.session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(startResult.session.currentPromptIndex).toBe(0);

    const sessionId = startResult.session.id;

    // 2. Idempotent start returns same session
    const idempotentStart = await startSessionUseCase.execute({
      routeId,
      variantKey: targetVariantKey,
    });
    expect(idempotentStart.isNew).toBe(false);
    expect(idempotentStart.session.id).toBe(sessionId);

    // 3. Get current prompt (prompt 0)
    const prompt0 = await getPromptUseCase.execute({ sessionId });
    expect(prompt0.prompt).not.toBeNull();
    expect(prompt0.prompt?.promptIndex).toBe(0);
    expect(prompt0.prompt?.recallMode).toBe(RecallMode.NEXT_STOP_FORWARD);
    // expectedAnswer is hidden
    expect((prompt0.prompt as unknown as Record<string, unknown>).expectedAnswer).toBeUndefined();

    // Query DB session to inspect snapshot expected answer for testing
    const dbSession0 = await recallRepo.findById(sessionId);
    const expected0 = dbSession0?.currentExpectedAnswer ?? '';
    expect(expected0).toBeDefined();

    // 4. Submit correct answer for prompt 0
    const submit0 = await submitAnswerUseCase.execute({
      sessionId,
      promptIndex: 0,
      rawInput: expected0,
    });
    expect(submit0.outcome).toBe(RecallOutcome.PASS);
    expect(submit0.promptIndex).toBe(0);
    expect(submit0.isSessionCompleted).toBe(false);

    // 5. Submit idempotency: re-submitting prompt 0 returns recorded outcome without duplicate attempt
    const duplicateSubmit0 = await submitAnswerUseCase.execute({
      sessionId,
      promptIndex: 0,
      rawInput: expected0,
    });
    expect(duplicateSubmit0.outcome).toBe(RecallOutcome.PASS);

    const attemptsAfterPrompt0 = await recallRepo.findAttemptsBySessionId(sessionId);
    expect(attemptsAfterPrompt0).toHaveLength(1);
    expect(attemptsAfterPrompt0[0].durationMs).toBeGreaterThanOrEqual(0);

    // 6. Get prompt 1
    const prompt1 = await getPromptUseCase.execute({ sessionId });
    expect(prompt1.prompt).not.toBeNull();
    expect(prompt1.prompt?.promptIndex).toBe(1);

    const dbSession1 = await recallRepo.findById(sessionId);
    const expected1 = dbSession1?.currentExpectedAnswer ?? '';

    // 7. Submit answer for prompt 1 (the final prompt in a 3-stop variant: N-1 = 2 prompts: index 0 and 1)
    const submit1 = await submitAnswerUseCase.execute({
      sessionId,
      promptIndex: 1,
      rawInput: expected1,
    });
    expect(submit1.outcome).toBe(RecallOutcome.PASS);
    expect(submit1.isSessionCompleted).toBe(true);

    // 8. Verify session is COMPLETED in DB
    const finalSession = await recallRepo.findById(sessionId);
    expect(finalSession?.status).toBe(SessionStatus.COMPLETED);
    expect(finalSession?.completedAt).not.toBeNull();
    expect(finalSession?.currentExpectedAnswer).toBeNull();

    // 9. Verify attempts telemetry
    const allAttempts = await recallRepo.findAttemptsBySessionId(sessionId);
    expect(allAttempts).toHaveLength(2);
    expect(allAttempts[0].promptIndex).toBe(0);
    expect(allAttempts[0].outcome).toBe(RecallOutcome.PASS);
    expect(allAttempts[1].promptIndex).toBe(1);
    expect(allAttempts[1].outcome).toBe(RecallOutcome.PASS);

    // 10. Verify a new session can now be started since previous is COMPLETED
    const nextSession = await startSessionUseCase.execute({
      routeId,
      variantKey: targetVariantKey,
    });
    expect(nextSession.isNew).toBe(true);
    expect(nextSession.session.id).not.toBe(sessionId);

    // Clean up next session
    await completeSessionUseCase.execute({
      sessionId: nextSession.session.id,
      action: 'ABANDON',
    });
  });

  it('runs training cycle in STOP_NAME_RECOGNITION mode and tests ABANDON action', async () => {
    const startStopNameUseCase = new StartRecallSessionUseCase(
      recallRepo,
      learningRepo,
      getRouteVariantsUseCase,
      stopNameStrategy,
    );
    const submitStopNameUseCase = new SubmitRecallAnswerUseCase(
      recallRepo,
      learningRepo,
      getRouteVariantsUseCase,
      stopNameStrategy,
    );

    // 1. Start STOP_NAME_RECOGNITION session
    const startResult = await startStopNameUseCase.execute({
      routeId,
      variantKey: targetVariantKey,
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
    });
    expect(startResult.isNew).toBe(true);
    expect(startResult.session.currentRecallMode).toBe(RecallMode.STOP_NAME_RECOGNITION);

    const sessionId = startResult.session.id;

    // 2. Submit prompt 0 with extra spaces and mixed casing (tests deterministic normalization)
    const dbSession = await recallRepo.findById(sessionId);
    const expected = dbSession?.currentExpectedAnswer ?? '';
    const noisyInput = `  ${expected.toUpperCase()}   `;

    const submit0 = await submitStopNameUseCase.execute({
      sessionId,
      promptIndex: 0,
      rawInput: noisyInput,
    });
    expect(submit0.outcome).toBe(RecallOutcome.PASS);

    // 3. User decides to abandon session mid-way
    const abandonResult = await completeSessionUseCase.execute({
      sessionId,
      action: 'ABANDON',
    });
    expect(abandonResult.session.status).toBe(SessionStatus.ABANDONED);
    expect(abandonResult.session.abandonedAt).not.toBeNull();

    // 4. Verify no active session remains
    const active = await recallRepo.findActiveSession(DEFAULT_DRIVER_ID, targetVariantKey);
    expect(active).toBeNull();
  });

  it('guarantees concurrent duplicate submission idempotency via real Promise.all database race', async () => {
    // 1. Start a fresh session
    const startResult = await startSessionUseCase.execute({
      routeId,
      variantKey: targetVariantKey,
    });
    expect(startResult.isNew).toBe(true);
    const sessionId = startResult.session.id;

    // 2. Read snapshot expected answer
    const sessionBefore = await recallRepo.findById(sessionId);
    const expectedAnswer = sessionBefore?.currentExpectedAnswer ?? '';
    expect(expectedAnswer).toBeDefined();

    // 3. Fire two concurrent submit requests for the EXACT same promptIndex 0
    const [resA, resB] = await Promise.all([
      submitAnswerUseCase.execute({
        sessionId,
        promptIndex: 0,
        rawInput: expectedAnswer,
      }),
      submitAnswerUseCase.execute({
        sessionId,
        promptIndex: 0,
        rawInput: expectedAnswer,
      }),
    ]);

    // 4. Both requests must resolve successfully and idempotently (no unhandled P2002 error)
    expect(resA.outcome).toBe(RecallOutcome.PASS);
    expect(resB.outcome).toBe(RecallOutcome.PASS);
    expect(resA.promptIndex).toBe(0);
    expect(resB.promptIndex).toBe(0);

    // 5. Database state verification:
    // Exactly 1 RecallAttempt was written
    const attempts = await recallRepo.findAttemptsBySessionId(sessionId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].promptIndex).toBe(0);

    // Cursor advanced to prompt 1 exactly once
    const sessionAfter = await recallRepo.findById(sessionId);
    expect(sessionAfter?.currentPromptIndex).toBe(1);
    expect(sessionAfter?.status).toBe(SessionStatus.IN_PROGRESS);
    expect(sessionAfter?.currentExpectedAnswer).toBeDefined();

    // Clean up
    await completeSessionUseCase.execute({
      sessionId,
      action: 'ABANDON',
    });
  });
});

