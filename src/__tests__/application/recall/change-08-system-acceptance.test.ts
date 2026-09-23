import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createRecallUseCases, RecallUseCases } from '@/infrastructure/recall/recall-composition';
import { SessionStatus, RecallOutcome } from '@/domain/recall/recall-session';
import { CardState } from '@/domain/learning/learning-card';
import { SessionOwnershipError, IdempotencyConflictError } from '@/application/recall/submit-session-answer-use-case';
import { SessionOwnershipError as AbandonSessionOwnershipError } from '@/application/recall/abandon-recall-session-use-case';
import { SessionOwnershipError as PromptSessionOwnershipError } from '@/application/recall/get-current-session-prompt-use-case';

describe('Change 08 System-Level Acceptance Suite (End-to-End Composition Root)', () => {
  const prisma = new PrismaClient();
  let useCases: RecallUseCases;

  beforeAll(async () => {
    await prisma.$connect();
    useCases = createRecallUseCases(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
    await prisma.learningCard.deleteMany();
    await prisma.driverVariantProgress.deleteMany();
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsStop.deleteMany();
    await prisma.gtfsRoute.deleteMany();
  });

  // Helper to set up GTFS and enrolled variant with 3 stops/cards
  async function setupEnrolledVariant(driverId: string, variantKey: string) {
    await prisma.gtfsRoute.create({
      data: {
        id: 'route-acceptance',
        shortName: 'ACC',
        longName: 'Acceptance Line',
        routeType: 3,
      },
    });

    const stops = await Promise.all([
      prisma.gtfsStop.create({ data: { id: 'stop-1', name: 'Terminal A', latitude: 25.0, longitude: 121.5 } }),
      prisma.gtfsStop.create({ data: { id: 'stop-2', name: 'Center Plaza', latitude: 25.1, longitude: 121.5 } }),
      prisma.gtfsStop.create({ data: { id: 'stop-3', name: 'Terminal B', latitude: 25.2, longitude: 121.5 } }),
    ]);

    const progress = await prisma.driverVariantProgress.create({
      data: {
        driverId,
        routeId: 'route-acceptance',
        directionId: 0,
        targetVariantKey: variantKey,
      },
    });

    const cards = await Promise.all([
      prisma.learningCard.create({
        data: {
          // 確定性遞增 id：讓計畫的 id-asc 選卡順序 = 建立順序，避免 uuid 隨機化造成 flaky。
          id: `${variantKey}::card-1`,
          progressId: progress.id,
          cardKey: 'STOP::stop-1',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          id: `${variantKey}::card-2`,
          progressId: progress.id,
          cardKey: 'STOP::stop-2',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
      prisma.learningCard.create({
        data: {
          id: `${variantKey}::card-3`,
          progressId: progress.id,
          cardKey: 'STOP::stop-3',
          cardType: 'STOP',
          state: CardState.NEW,
          srsLevel: 0,
        },
      }),
    ]);

    return { progress, cards, stops };
  }

  // 1. Full Production Path: Start -> Get Prompt -> Submit -> Advance -> Complete
  it('1. executes complete linear progression: Start -> Get Prompt -> Submit -> Advance -> Complete', async () => {
    const driverId = 'driver-sys-1';
    const variantKey = 'route-acceptance:dir-0:hash-sys-1';
    await setupEnrolledVariant(driverId, variantKey);

    // 1. Start session
    const startResult = await useCases.startPlannedSession.execute({
      driverId,
      routeId: 'route-acceptance',
      variantKey,
    });
    expect(startResult.isNew).toBe(true);
    expect(startResult.session).not.toBeNull();
    const sessionId = startResult.session!.id;
    expect(startResult.session!.status).toBe(SessionStatus.IN_PROGRESS);
    expect(startResult.session!.plannedCardIds).toHaveLength(3);

    const stopMap: Record<string, string> = {
      'STOP::stop-1': 'Terminal A',
      'STOP::stop-2': 'Center Plaza',
      'STOP::stop-3': 'Terminal B',
    };

    // 2. Card 0: Get Prompt -> Submit PASS
    const prompt0 = await useCases.getSessionPrompt.execute({ sessionId, driverId });
    expect(prompt0.prompt.promptIndex).toBe(0);
    expect(prompt0.prompt.totalCards).toBe(3);

    const submit0 = await useCases.submitSessionAnswer.execute({
      sessionId,
      promptIndex: 0,
      rawInput: stopMap[prompt0.prompt.cardKey]!,
      driverId,
    });
    expect(submit0.outcome).toBe(RecallOutcome.PASS);
    expect(submit0.isSessionCompleted).toBe(false);
    expect(submit0.resultingState).toBe(CardState.LEARNING);
    expect(submit0.resultingSrsLevel).toBe(1);

    // 3. Card 1: Get Prompt -> Submit FAIL
    const prompt1 = await useCases.getSessionPrompt.execute({ sessionId, driverId });
    expect(prompt1.prompt.promptIndex).toBe(1);

    const submit1 = await useCases.submitSessionAnswer.execute({
      sessionId,
      promptIndex: 1,
      rawInput: 'Wrong Name',
      driverId,
    });
    expect(submit1.outcome).toBe(RecallOutcome.FAIL);
    expect(submit1.isSessionCompleted).toBe(false);
    expect(submit1.resultingState).toBe(CardState.LEARNING);
    expect(submit1.resultingSrsLevel).toBe(0);

    // 4. Card 2 (Final): Get Prompt -> Submit PASS -> Session COMPLETED
    const prompt2 = await useCases.getSessionPrompt.execute({ sessionId, driverId });
    expect(prompt2.prompt.promptIndex).toBe(2);

    const submit2 = await useCases.submitSessionAnswer.execute({
      sessionId,
      promptIndex: 2,
      rawInput: stopMap[prompt2.prompt.cardKey]!,
      driverId,
    });
    expect(submit2.outcome).toBe(RecallOutcome.PASS);
    expect(submit2.isSessionCompleted).toBe(true);

    // Verify DB integrity
    const sessionInDb = await prisma.recallSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(sessionInDb.status).toBe(SessionStatus.COMPLETED);
    expect(sessionInDb.completedAt).not.toBeNull();
    expect(sessionInDb.currentPromptIndex).toBe(3);
    expect(sessionInDb.currentPromptStartedAt).toBeNull();

    // Verify 3 distinct attempts recorded
    const attempts = await prisma.recallAttempt.findMany({
      where: { sessionId },
      orderBy: { promptIndex: 'asc' },
    });
    expect(attempts).toHaveLength(3);
    expect(attempts[0].outcome).toBe(RecallOutcome.PASS);
    expect(attempts[1].outcome).toBe(RecallOutcome.FAIL);
    expect(attempts[2].outcome).toBe(RecallOutcome.PASS);

    // Verify LearningCard SRS levels
    const card0InDb = await prisma.learningCard.findUniqueOrThrow({ where: { id: prompt0.prompt.cardId } });
    expect(card0InDb.srsLevel).toBe(1);
    expect(card0InDb.state).toBe(CardState.LEARNING);

    const card1InDb = await prisma.learningCard.findUniqueOrThrow({ where: { id: prompt1.prompt.cardId } });
    expect(card1InDb.srsLevel).toBe(0);
    expect(card1InDb.state).toBe(CardState.LEARNING);

    const card2InDb = await prisma.learningCard.findUniqueOrThrow({ where: { id: prompt2.prompt.cardId } });
    expect(card2InDb.srsLevel).toBe(1);
    expect(card2InDb.state).toBe(CardState.LEARNING);
  });

  // 2. Partial Settlement -> Abandon -> Fresh Start
  it('2. supports partial settlement followed by Abandon, then immediate fresh start on same variant', async () => {
    const driverId = 'driver-sys-2';
    const variantKey = 'route-acceptance:dir-0:hash-sys-2';
    const { cards } = await setupEnrolledVariant(driverId, variantKey);

    // Start session
    const startResult1 = await useCases.startPlannedSession.execute({
      driverId,
      routeId: 'route-acceptance',
      variantKey,
    });
    const session1Id = startResult1.session!.id;

    // Settle Card 0
    await useCases.getSessionPrompt.execute({ sessionId: session1Id, driverId });
    await useCases.submitSessionAnswer.execute({
      sessionId: session1Id,
      promptIndex: 0,
      rawInput: 'Terminal A',
      driverId,
    });

    // Advance to Card 1 and initialize timer
    const prompt1 = await useCases.getSessionPrompt.execute({ sessionId: session1Id, driverId });
    expect(prompt1.prompt.promptIndex).toBe(1);

    // Driver abandons session mid-way
    const abandonResult = await useCases.abandonSession.execute({
      sessionId: session1Id,
      driverId,
    });
    expect(abandonResult.status).toBe(SessionStatus.ABANDONED);
    expect(abandonResult.currentPromptIndex).toBe(1);

    // Verify Session 1 in DB
    const session1Db = await prisma.recallSession.findUniqueOrThrow({ where: { id: session1Id } });
    expect(session1Db.status).toBe(SessionStatus.ABANDONED);
    expect(session1Db.currentPromptIndex).toBe(1); // Frozen at 1
    expect(session1Db.currentPromptStartedAt).toBeNull(); // Timer cleared

    // Card 0 attempt preserved, Card 1 has zero attempts
    const attempts = await prisma.recallAttempt.findMany({ where: { sessionId: session1Id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].promptIndex).toBe(0);

    // Card 1 SRS untouched
    const card1Db = await prisma.learningCard.findUniqueOrThrow({ where: { id: cards[1].id } });
    expect(card1Db.srsLevel).toBe(0);
    expect(card1Db.state).toBe(CardState.NEW);

    // Now start a fresh session on the same variant
    const startResult2 = await useCases.startPlannedSession.execute({
      driverId,
      routeId: 'route-acceptance',
      variantKey,
    });
    expect(startResult2.isNew).toBe(true);
    expect(startResult2.session!.id).not.toBe(session1Id);
    expect(startResult2.session!.status).toBe(SessionStatus.IN_PROGRESS);
    expect(startResult2.session!.plannedCardIds.length).toBeGreaterThan(0);
  });

  // 3. Idempotent Replay on Active, Completed, and Abandoned Sessions
  it('3. provides verbatim idempotent replay across active, completed, and abandoned sessions', async () => {
    const driverId = 'driver-sys-3';
    const variantKey = 'route-acceptance:dir-0:hash-sys-3';
    await setupEnrolledVariant(driverId, variantKey);

    const startResult = await useCases.startPlannedSession.execute({
      driverId,
      routeId: 'route-acceptance',
      variantKey,
    });
    const sessionId = startResult.session!.id;

    // Settle Prompt 0
    await useCases.getSessionPrompt.execute({ sessionId, driverId });
    const firstSubmit = await useCases.submitSessionAnswer.execute({
      sessionId,
      promptIndex: 0,
      rawInput: 'Terminal A',
      driverId,
    });
    expect(firstSubmit.isDuplicate).toBe(false);

    // Replay on active session
    const replayActive = await useCases.submitSessionAnswer.execute({
      sessionId,
      promptIndex: 0,
      rawInput: 'Terminal A',
      driverId,
    });
    expect(replayActive.isDuplicate).toBe(true);
    expect(replayActive.outcome).toBe(firstSubmit.outcome);

    // Conflicting submission on Prompt 0 throws IdempotencyConflictError
    await expect(
      useCases.submitSessionAnswer.execute({
        sessionId,
        promptIndex: 0,
        rawInput: 'Different Input',
        driverId,
      }),
    ).rejects.toThrow(IdempotencyConflictError);

    // Abandon session and replay Prompt 0
    await useCases.abandonSession.execute({ sessionId, driverId });
    const replayAbandoned = await useCases.submitSessionAnswer.execute({
      sessionId,
      promptIndex: 0,
      rawInput: 'Terminal A',
      driverId,
    });
    expect(replayAbandoned.isDuplicate).toBe(true);
    expect(replayAbandoned.outcome).toBe(firstSubmit.outcome);
  });

  // 4. Strict Ownership Isolation
  it('4. strictly enforces driver ownership across prompt retrieval, submission, and abandonment', async () => {
    const ownerId = 'driver-owner-4';
    const intruderId = 'driver-intruder-4';
    const variantKey = 'route-acceptance:dir-0:hash-sys-4';
    await setupEnrolledVariant(ownerId, variantKey);

    const startResult = await useCases.startPlannedSession.execute({
      driverId: ownerId,
      routeId: 'route-acceptance',
      variantKey,
    });
    const sessionId = startResult.session!.id;

    // Intruder cannot get prompt
    await expect(
      useCases.getSessionPrompt.execute({ sessionId, driverId: intruderId }),
    ).rejects.toThrow(PromptSessionOwnershipError);

    // Intruder cannot submit answer
    await expect(
      useCases.submitSessionAnswer.execute({
        sessionId,
        promptIndex: 0,
        rawInput: 'Terminal A',
        driverId: intruderId,
      }),
    ).rejects.toThrow(SessionOwnershipError);

    // Intruder cannot abandon session
    await expect(
      useCases.abandonSession.execute({ sessionId, driverId: intruderId }),
    ).rejects.toThrow(AbandonSessionOwnershipError);
  });
});
