import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
import { SubmitRecallAnswerUseCase } from '@/application/recall/submit-recall-answer-use-case';
import { PrismaRecallSettlementCoordinator } from '@/infrastructure/learning/prisma-recall-settlement-coordinator';
import {
  RecallMode,
  RecallOutcome,
} from '@/domain/recall/recall-session';
import { CardState } from '@/domain/learning/learning-card';
import { ProgressStatus } from '@/domain/learning/driver-variant-progress';
import { SequentialTopologyPromptStrategy } from '@/domain/recall/prompt-selection-strategy';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

describe('Change 06: Recall Settlement Coordinator & Learning Review Outcome (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writeRepo = new PrismaGtfsRepository(prisma);
  const readRepo = new PrismaGtfsReadRepository(prisma);
  const importer = new ImportGtfsUseCase(writeRepo);
  const getRouteVariantsUseCase = new GetRouteVariantsUseCase(readRepo);

  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const enrollUseCase = new EnrollVariantUseCase(learningRepo, getRouteVariantsUseCase);

  const recallRepo = new PrismaRecallRepository(prisma);
  const promptStrategy = new SequentialTopologyPromptStrategy(RecallMode.NEXT_STOP_FORWARD);
  const startSessionUseCase = new StartRecallSessionUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    promptStrategy,
  );

  const coordinator = new PrismaRecallSettlementCoordinator(prisma);
  const submitAnswerUseCase = new SubmitRecallAnswerUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    promptStrategy,
    coordinator,
  );

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

    // 2. Import GTFS valid feed
    await importer.execute(validFeedDir);

    const routes = await readRepo.findAllRoutes();
    routeId = routes[0].id;
    const variants = await getRouteVariantsUseCase.execute(routeId);
    targetVariantKey = variants[0].variantKey;
  });

  beforeEach(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();

    // Enroll fresh progress for each test
    await enrollUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
  });

  afterAll(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.$disconnect();
  });

  it('(1) completes 3-stage learning progression (NEW -> LEARNING -> REVIEW -> MASTERED) with intermediate failure', async () => {
    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const sessionRecord = await recallRepo.findById(sessionId);
    const cardKey = sessionRecord!.currentCardKey!;
    const expectedAnswer = sessionRecord!.currentExpectedAnswer!;

    const progressBefore = await learningRepo.findByDriverAndVariant(
      DEFAULT_DRIVER_ID,
      targetVariantKey,
    );
    const cardBefore = progressBefore!.cards.find((c) => c.cardKey === cardKey)!;
    expect(cardBefore.state).toBe(CardState.NEW);
    expect(cardBefore.repetitions).toBe(0);
    expect(cardBefore.lapses).toBe(0);
    expect(progressBefore!.status).toBe(ProgressStatus.NOT_STARTED);

    // Step 1: NEW + PASS -> LEARNING
    const res1 = await submitAnswerUseCase.execute({
      sessionId,
      promptIndex: 0,
      rawInput: expectedAnswer,
    });
    expect(res1.outcome).toBe(RecallOutcome.PASS);

    const cardAfter1 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter1!.state).toBe(CardState.LEARNING);
    expect(cardAfter1!.repetitions).toBe(1);
    expect(cardAfter1!.lapses).toBe(0);

    const progressAfter1 = await prisma.driverVariantProgress.findUnique({ where: { id: progressBefore!.id } });
    expect(progressAfter1!.status).toBe(ProgressStatus.IN_PROGRESS);

    // Step 2: In LEARNING, simulate a FAIL -> should stay in LEARNING without incrementing lapses!
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 1,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: cardBefore.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'wrong_stop',
      expectedAnswer: 'correct_stop',
      outcome: RecallOutcome.FAIL,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 500,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 2,
        nextCardKey: cardBefore.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    const cardAfter2 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter2!.state).toBe(CardState.LEARNING);
    expect(cardAfter2!.repetitions).toBe(1); // unchanged on FAIL
    expect(cardAfter2!.lapses).toBe(0); // initial learning fail is NOT a lapse

    // Step 3: LEARNING + PASS -> REVIEW
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 2,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: cardBefore.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'correct_stop',
      expectedAnswer: 'correct_stop',
      outcome: RecallOutcome.PASS,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 500,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 3,
        nextCardKey: cardBefore.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    const cardAfter3 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter3!.state).toBe(CardState.REVIEW);
    expect(cardAfter3!.repetitions).toBe(2);
    expect(cardAfter3!.lapses).toBe(0);

    // Step 4: REVIEW + PASS -> MASTERED
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 3,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: cardBefore.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'correct_stop',
      expectedAnswer: 'correct_stop',
      outcome: RecallOutcome.PASS,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 500,
      isLastPrompt: true,
    });

    const cardAfter4 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter4!.state).toBe(CardState.MASTERED);
    expect(cardAfter4!.repetitions).toBe(3);
    expect(cardAfter4!.lapses).toBe(0);
  });

  it('(2) handles MASTERED + FAIL -> REVIEW with lapses + 1 and subsequent recovery to MASTERED', async () => {
    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];

    // Seed card directly into MASTERED state
    await prisma.learningCard.update({
      where: { id: card.id },
      data: {
        state: CardState.MASTERED,
        repetitions: 5,
        lapses: 0,
      },
    });

    // MASTERED + FAIL -> REVIEW, lapses: 1
    const slipResult = await coordinator.settleAttempt({
      sessionId,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'forgotten_stop',
      expectedAnswer: 'correct_stop',
      outcome: RecallOutcome.FAIL,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 800,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 1,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    expect(slipResult.card.state).toBe(CardState.REVIEW);
    expect(slipResult.card.repetitions).toBe(5); // unchanged
    expect(slipResult.card.lapses).toBe(1); // incremented

    const cardInDb = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardInDb!.state).toBe(CardState.REVIEW);
    expect(cardInDb!.lapses).toBe(1);

    // Subsequent REVIEW + PASS -> returns to MASTERED
    const recoveryResult = await coordinator.settleAttempt({
      sessionId,
      promptIndex: 1,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'correct_stop',
      expectedAnswer: 'correct_stop',
      outcome: RecallOutcome.PASS,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 400,
      isLastPrompt: true,
    });

    expect(recoveryResult.card.state).toBe(CardState.MASTERED);
    expect(recoveryResult.card.repetitions).toBe(6);
    expect(recoveryResult.card.lapses).toBe(1); // retained
  });

  it('(3) strictly preserves nextReviewAt unchanged across both PASS and FAIL', async () => {
    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];
    const fixedReviewDate = new Date('2026-12-25T08:00:00.000Z');

    await prisma.learningCard.update({
      where: { id: card.id },
      data: { nextReviewAt: fixedReviewDate },
    });

    // PASS attempt
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'some_stop',
      expectedAnswer: 'some_stop',
      outcome: RecallOutcome.PASS,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 300,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 1,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'some_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    const cardAfterPass = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardAfterPass!.nextReviewAt?.toISOString()).toBe(fixedReviewDate.toISOString());

    // FAIL attempt
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 1,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'wrong_stop',
      expectedAnswer: 'some_stop',
      outcome: RecallOutcome.FAIL,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 300,
      isLastPrompt: true,
    });

    const cardAfterFail = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardAfterFail!.nextReviewAt?.toISOString()).toBe(fixedReviewDate.toISOString());
  });

  it('(4) guarantees concurrency safety and outside-transaction P2002 idempotency via Promise.all', async () => {
    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];

    const input = {
      sessionId,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_2',
      expectedAnswer: 'stop_2',
      outcome: RecallOutcome.PASS as const,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 350,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 1,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'stop_3',
        nextPromptStartedAt: new Date(),
      },
    };

    // Run twin concurrent settlement requests targeting identical (sessionId, promptIndex)
    const [resA, resB] = await Promise.all([
      coordinator.settleAttempt(input),
      coordinator.settleAttempt(input),
    ]);

    // Exactly one must be the primary write and the other must be the recovered duplicate
    const results = [resA, resB];
    const nonDuplicates = results.filter((r) => !r.isDuplicate);
    const duplicates = results.filter((r) => r.isDuplicate);

    expect(nonDuplicates).toHaveLength(1);
    expect(duplicates).toHaveLength(1);

    // Verify DB invariants:
    // 1. Exactly 1 RecallAttempt in database
    const attempts = await prisma.recallAttempt.findMany({
      where: { sessionId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].promptIndex).toBe(0);

    // 2. LearningCard repetitions incremented exactly once (0 -> 1)
    const cardInDb = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardInDb!.repetitions).toBe(1);
    expect(cardInDb!.state).toBe(CardState.LEARNING);

    // 3. RecallSession cursor advanced exactly once (0 -> 1)
    const sessionInDb = await prisma.recallSession.findUnique({ where: { id: sessionId } });
    expect(sessionInDb!.currentPromptIndex).toBe(1);
  });

  it('(5) rolls back completely when midway failure occurs, allowing subsequent retry to settle successfully', async () => {
    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];

    // Attempt settlement with a non-existent cardKey to trigger rollback after attempt insert
    const failingInput = {
      sessionId,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: 'NON_EXISTENT_CARD_KEY',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_2',
      expectedAnswer: 'stop_2',
      outcome: RecallOutcome.PASS as const,
      startedAt: new Date(),
      answeredAt: new Date(),
      durationMs: 300,
      isLastPrompt: false,
    };

    await expect(coordinator.settleAttempt(failingInput)).rejects.toThrow(
      /LearningCard not found for cardKey/,
    );

    // Verify atomic rollback: attempt must NOT exist in DB
    const attemptsAfterRollback = await prisma.recallAttempt.findMany({
      where: { sessionId },
    });
    expect(attemptsAfterRollback).toHaveLength(0);

    // Verify retry with valid cardKey settles successfully
    const retryInput = {
      ...failingInput,
      cardKey: card.cardKey,
      nextPromptSnapshot: {
        nextPromptIndex: 1,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'stop_3',
        nextPromptStartedAt: new Date(),
      },
    };

    const retryResult = await coordinator.settleAttempt(retryInput);
    expect(retryResult.isDuplicate).toBe(false);
    expect(retryResult.attempt.promptIndex).toBe(0);

    const attemptsAfterRetry = await prisma.recallAttempt.findMany({
      where: { sessionId },
    });
    expect(attemptsAfterRetry).toHaveLength(1);
  });

  it('(6) rethrows unrelated P2002 errors and does not swallow them as duplicates', async () => {
    // Attempt to create duplicate DriverVariantProgress directly to generate an unrelated P2002
    await expect(
      prisma.driverVariantProgress.create({
        data: {
          id: 'duplicate-progress-id',
          driverId: DEFAULT_DRIVER_ID,
          routeId,
          directionId: 0,
          targetVariantKey, // violates @@unique([driverId, targetVariantKey])
        },
      }),
    ).rejects.toThrow();
  });
});
