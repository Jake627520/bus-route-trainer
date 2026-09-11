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
import { randomUUID } from 'crypto';
import { Clock } from '@/application/common/clock';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

class FixedClock implements Clock {
  constructor(private currentDate: Date) {}
  now(): Date {
    return this.currentDate;
  }
  setDate(d: Date): void {
    this.currentDate = d;
  }
}

describe('Change 06 & 07: Recall Settlement Coordinator & Learning Review Outcome (PostgreSQL)', () => {
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

  it('(1) completes 3-stage learning progression (NEW -> LEARNING -> REVIEW -> MASTERED) with intermediate failure and SRS ladder levels', async () => {
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
    expect(cardBefore.srsLevel).toBe(0);
    expect(cardBefore.repetitions).toBe(0);
    expect(cardBefore.lapses).toBe(0);
    expect(progressBefore!.status).toBe(ProgressStatus.NOT_STARTED);

    // Step 1: NEW (L0) + PASS -> LEARNING (L1, 1d)
    const res1 = await submitAnswerUseCase.execute({
      sessionId,
      promptIndex: 0,
      rawInput: expectedAnswer,
    });
    expect(res1.outcome).toBe(RecallOutcome.PASS);

    const cardAfter1 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter1!.state).toBe(CardState.LEARNING);
    expect(cardAfter1!.srsLevel).toBe(1);
    expect(cardAfter1!.repetitions).toBe(1);
    expect(cardAfter1!.lapses).toBe(0);
    expect(cardAfter1!.nextReviewAt).not.toBeNull();

    const progressAfter1 = await prisma.driverVariantProgress.findUnique({ where: { id: progressBefore!.id } });
    expect(progressAfter1!.status).toBe(ProgressStatus.IN_PROGRESS);

    // Step 2: In LEARNING (L1), simulate a FAIL -> should reset to L0, stay in LEARNING without incrementing lapses
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
    expect(cardAfter2!.srsLevel).toBe(0);
    expect(cardAfter2!.repetitions).toBe(1); // unchanged on FAIL
    expect(cardAfter2!.lapses).toBe(0); // initial learning fail is NOT a lapse

    // Step 3: LEARNING (L0) + PASS -> REVIEW (L2, 3d)
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
    expect(cardAfter3!.srsLevel).toBe(2);
    expect(cardAfter3!.repetitions).toBe(2);
    expect(cardAfter3!.lapses).toBe(0);

    // Step 4: REVIEW (L2) + PASS -> REVIEW (L3, 7d)
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
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 4,
        nextCardKey: cardBefore.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    const cardAfter4 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter4!.state).toBe(CardState.REVIEW);
    expect(cardAfter4!.srsLevel).toBe(3);
    expect(cardAfter4!.repetitions).toBe(3);
    expect(cardAfter4!.lapses).toBe(0);

    // Step 5: REVIEW (L3) + PASS -> REVIEW (L4, 14d)
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 4,
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
        nextPromptIndex: 5,
        nextCardKey: cardBefore.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    const cardAfter5 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter5!.state).toBe(CardState.REVIEW);
    expect(cardAfter5!.srsLevel).toBe(4);
    expect(cardAfter5!.repetitions).toBe(4);
    expect(cardAfter5!.lapses).toBe(0);

    // Step 6: REVIEW (L4) + PASS -> MASTERED (L5, 30d)
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 5,
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

    const cardAfter6 = await prisma.learningCard.findUnique({ where: { id: cardBefore.id } });
    expect(cardAfter6!.state).toBe(CardState.MASTERED);
    expect(cardAfter6!.srsLevel).toBe(5);
    expect(cardAfter6!.repetitions).toBe(5);
    expect(cardAfter6!.lapses).toBe(0);
  });

  it('(2) handles MASTERED + FAIL -> REVIEW with lapses + 1 and subsequent recovery ladder to MASTERED', async () => {
    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];

    // Seed card directly into MASTERED state with srsLevel: 5
    await prisma.learningCard.update({
      where: { id: card.id },
      data: {
        state: CardState.MASTERED,
        srsLevel: 5,
        repetitions: 5,
        lapses: 0,
      },
    });

    // MASTERED (L5) + FAIL -> REVIEW (L0), lapses: 1
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
    expect(slipResult.card.srsLevel).toBe(0);
    expect(slipResult.card.repetitions).toBe(5); // unchanged
    expect(slipResult.card.lapses).toBe(1); // incremented

    const cardInDb = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardInDb!.state).toBe(CardState.REVIEW);
    expect(cardInDb!.srsLevel).toBe(0);
    expect(cardInDb!.lapses).toBe(1);

    // Recovery ladder: REVIEW L0 -> L1 -> L2 -> L3 -> L4 -> MASTERED L5
    // Pass 1: L0 -> L1
    await coordinator.settleAttempt({
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
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 2,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    // Pass 2: L1 -> L2
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 2,
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
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 3,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    // Pass 3: L2 -> L3
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 3,
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
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 4,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    // Pass 4: L3 -> L4
    await coordinator.settleAttempt({
      sessionId,
      promptIndex: 4,
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
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 5,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'correct_stop',
        nextPromptStartedAt: new Date(),
      },
    });

    // Pass 5: L4 -> MASTERED L5
    const recoveryFinal = await coordinator.settleAttempt({
      sessionId,
      promptIndex: 5,
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

    expect(recoveryFinal.card.state).toBe(CardState.MASTERED);
    expect(recoveryFinal.card.srsLevel).toBe(5);
    expect(recoveryFinal.card.repetitions).toBe(10);
    expect(recoveryFinal.card.lapses).toBe(1); // retained
  });

  it('(3) dynamically schedules nextReviewAt on PASS (interval ladder) and resets to 10m on FAIL via injected Clock', async () => {
    const baseTime = new Date('2026-09-11T10:00:00.000Z');
    const fixedClock = new FixedClock(baseTime);
    const clockCoordinator = new PrismaRecallSettlementCoordinator(prisma, fixedClock);

    const startResult = await startSessionUseCase.execute({
      driverId: DEFAULT_DRIVER_ID,
      routeId,
      variantKey: targetVariantKey,
    });
    const sessionId = startResult.session.id;

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];

    // Initial card: NEW, L0, nextReviewAt: null
    expect(card.state).toBe(CardState.NEW);
    expect(card.srsLevel).toBe(0);
    expect(card.nextReviewAt).toBeNull();

    // 1. PASS at baseTime: NEW (L0) -> LEARNING (L1), nextReviewAt = baseTime + 1 day
    await clockCoordinator.settleAttempt({
      sessionId,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'some_stop',
      expectedAnswer: 'some_stop',
      outcome: RecallOutcome.PASS,
      startedAt: baseTime,
      answeredAt: baseTime,
      durationMs: 300,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 1,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'some_stop',
        nextPromptStartedAt: baseTime,
      },
    });

    const cardAfterPass1 = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardAfterPass1!.state).toBe(CardState.LEARNING);
    expect(cardAfterPass1!.srsLevel).toBe(1);
    expect(cardAfterPass1!.nextReviewAt?.toISOString()).toBe('2026-09-12T10:00:00.000Z'); // +1d

    // 2. FAIL at T2 (2026-09-12T10:00:00.000Z): resets to L0, nextReviewAt = T2 + 10 minutes (strictly no max with previous date)
    const time2 = new Date('2026-09-12T10:00:00.000Z');
    fixedClock.setDate(time2);

    await clockCoordinator.settleAttempt({
      sessionId,
      promptIndex: 1,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'wrong_stop',
      expectedAnswer: 'some_stop',
      outcome: RecallOutcome.FAIL,
      startedAt: time2,
      answeredAt: time2,
      durationMs: 300,
      isLastPrompt: false,
      nextPromptSnapshot: {
        nextPromptIndex: 2,
        nextCardKey: card.cardKey,
        nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
        nextExpectedAnswer: 'some_stop',
        nextPromptStartedAt: time2,
      },
    });

    const cardAfterFail = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardAfterFail!.state).toBe(CardState.LEARNING);
    expect(cardAfterFail!.srsLevel).toBe(0);
    expect(cardAfterFail!.nextReviewAt?.toISOString()).toBe('2026-09-12T10:10:00.000Z'); // T2 + 10m

    // 3. PASS at T3 (2026-09-12T10:10:00.000Z): LEARNING (L0) -> REVIEW (L2), nextReviewAt = T3 + 3 days
    const time3 = new Date('2026-09-12T10:10:00.000Z');
    fixedClock.setDate(time3);

    await clockCoordinator.settleAttempt({
      sessionId,
      promptIndex: 2,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'some_stop',
      expectedAnswer: 'some_stop',
      outcome: RecallOutcome.PASS,
      startedAt: time3,
      answeredAt: time3,
      durationMs: 300,
      isLastPrompt: true,
    });

    const cardAfterPass2 = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(cardAfterPass2!.state).toBe(CardState.REVIEW);
    expect(cardAfterPass2!.srsLevel).toBe(2);
    expect(cardAfterPass2!.nextReviewAt?.toISOString()).toBe('2026-09-15T10:10:00.000Z'); // T3 + 3d
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

  it('(7) Test B (Guard #1 & #2): guarantees serialized valid events and prevents stale-read lost updates across concurrent sessions on same card', async () => {
    const fixedTime = new Date('2026-09-11T10:00:00.000Z');
    const fixedClock = new FixedClock(fixedTime);
    const clockCoordinator = new PrismaRecallSettlementCoordinator(prisma, fixedClock);

    const progress = await learningRepo.findByDriverAndVariant(DEFAULT_DRIVER_ID, targetVariantKey);
    const card = progress!.cards[0];

    // Ensure initial card state is strictly NEW / L0
    expect(card.state).toBe(CardState.NEW);
    expect(card.srsLevel).toBe(0);
    expect(card.repetitions).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.nextReviewAt).toBeNull();

    // Create two distinct active sessions targeting the same variant for the driver
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    await prisma.recallSession.createMany({
      data: [
        {
          id: sessionId1,
          driverId: DEFAULT_DRIVER_ID,
          routeId,
          targetVariantKey,
          status: 'IN_PROGRESS',
          currentPromptIndex: 0,
          currentCardKey: card.cardKey,
          currentRecallMode: 'NEXT_STOP_FORWARD',
          startedAt: fixedTime,
        },
        {
          id: sessionId2,
          driverId: DEFAULT_DRIVER_ID,
          routeId,
          targetVariantKey: `${targetVariantKey}-session2`,
          status: 'IN_PROGRESS',
          currentPromptIndex: 0,
          currentCardKey: card.cardKey,
          currentRecallMode: 'NEXT_STOP_FORWARD',
          startedAt: fixedTime,
        },
      ],
    });

    const inputA = {
      sessionId: sessionId1,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_answer',
      expectedAnswer: 'stop_answer',
      outcome: RecallOutcome.PASS as const,
      startedAt: fixedTime,
      answeredAt: fixedTime,
      durationMs: 300,
      isLastPrompt: true,
    };

    const inputB = {
      sessionId: sessionId2,
      promptIndex: 0,
      driverId: DEFAULT_DRIVER_ID,
      targetVariantKey,
      cardKey: card.cardKey,
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_answer',
      expectedAnswer: 'stop_answer',
      outcome: RecallOutcome.PASS as const,
      startedAt: fixedTime,
      answeredAt: fixedTime,
      durationMs: 350,
      isLastPrompt: true,
    };

    // Concurrently settle Event A (from Session 1) and Event B (from Session 2) on SAME card
    const [resA, resB] = await Promise.all([
      clockCoordinator.settleAttempt(inputA),
      clockCoordinator.settleAttempt(inputB),
    ]);

    // Both must be valid non-duplicate events
    expect(resA.isDuplicate).toBe(false);
    expect(resB.isDuplicate).toBe(false);

    // Verify 2 distinct attempts exist in DB
    const attempts = await prisma.recallAttempt.findMany({
      where: {
        sessionId: { in: [sessionId1, sessionId2] },
        cardKey: card.cardKey,
      },
    });
    expect(attempts).toHaveLength(2);

    // Verify DB card final state:
    // Event 1 transitions L0 -> L1 (1d, 2026-09-12T10:00:00.000Z)
    // Event 2 (locked by SELECT FOR UPDATE) reads committed L1, transitions L1 -> L2 (3d, 2026-09-14T10:00:00.000Z)
    const finalCard = await prisma.learningCard.findUnique({ where: { id: card.id } });
    expect(finalCard!.state).toBe(CardState.REVIEW);
    expect(finalCard!.srsLevel).toBe(2);
    expect(finalCard!.repetitions).toBe(2);
    expect(finalCard!.lapses).toBe(0);

    // Critical Guard #2 verification:
    // If Event B read stale L0, nextReviewAt would be 2026-09-12T10:00:00.000Z (T + 1d).
    // Because SELECT FOR UPDATE serialized them, Event B used L1 to produce L2 with nextReviewAt = T + 3d!
    expect(finalCard!.nextReviewAt?.toISOString()).toBe('2026-09-14T10:00:00.000Z');
  });
});
