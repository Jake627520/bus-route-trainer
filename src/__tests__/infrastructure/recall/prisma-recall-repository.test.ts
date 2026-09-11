import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaRecallRepository } from '../../../infrastructure/recall/prisma-recall-repository';
import { CardState } from '../../../domain/learning/learning-card';
import {
  RecallSession,
  SessionStatus,
  RecallMode,
  RecallOutcome,
} from '../../../domain/recall/recall-session';
import { RecallAttempt } from '../../../domain/recall/recall-attempt';

describe('PrismaRecallRepository Integration Tests', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaRecallRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.recallAttempt.deleteMany();
    await prisma.recallSession.deleteMany();
  });

  it('(1) atomically creates session with prompt snapshot and saves attempts advancing cursor', async () => {
    const startedAt = new Date();
    const session = new RecallSession({
      id: 'session-atom-1',
      driverId: 'driver-test-1',
      routeId: 'route-66',
      targetVariantKey: 'variant-66-dir0',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: 'NEXT_STOP::stop_1->stop_2',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: 'stop_2',
      currentPromptStartedAt: startedAt,
      startedAt,
      completedAt: null,
      abandonedAt: null,
    });

    await repository.createSession(session);

    const activeSession = await repository.findActiveSession('driver-test-1', 'variant-66-dir0');
    expect(activeSession).not.toBeNull();
    expect(activeSession?.id).toBe('session-atom-1');
    expect(activeSession?.currentPromptIndex).toBe(0);
    expect(activeSession?.currentExpectedAnswer).toBe('stop_2');

    // Create attempt 0 and advance cursor to prompt 1
    const answeredAt = new Date(startedAt.getTime() + 1500);
    const attempt0 = new RecallAttempt({
      id: 'attempt-0',
      sessionId: 'session-atom-1',
      promptIndex: 0,
      cardKey: 'NEXT_STOP::stop_1->stop_2',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 'stop_2',
      expectedAnswer: 'stop_2',
      outcome: RecallOutcome.PASS,
      startedAt,
      answeredAt,
    });

    const advancedSession = session.advanceCursor({
      nextPromptIndex: 1,
      nextCardKey: 'NEXT_STOP::stop_2->stop_3',
      nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
      nextExpectedAnswer: 'stop_3',
      nextPromptStartedAt: answeredAt,
    });

    const result = await repository.saveAttemptAndAdvanceSession(attempt0, advancedSession);
    expect(result.attempt.id).toBe('attempt-0');
    expect(result.attempt.durationMs).toBe(1500);
    expect(result.session.currentPromptIndex).toBe(1);
    expect(result.session.currentExpectedAnswer).toBe('stop_3');

    const attempts = await repository.findAttemptsBySessionId('session-atom-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].promptIndex).toBe(0);
  });

  it('(2) enforces partial unique index preventing multiple IN_PROGRESS sessions for same (driverId, targetVariantKey)', async () => {
    const session1 = new RecallSession({
      id: 'session-active-1',
      driverId: 'driver-dup-test',
      routeId: 'route-66',
      targetVariantKey: 'variant-unique-key',
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

    await repository.createSession(session1);

    const session2 = new RecallSession({
      id: 'session-active-2',
      driverId: 'driver-dup-test',
      routeId: 'route-66',
      targetVariantKey: 'variant-unique-key',
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

    await expect(repository.createSession(session2)).rejects.toThrow();
  });

  it('(3) enforces @@unique([sessionId, promptIndex]) preventing duplicate attempts for same prompt', async () => {
    const startedAt = new Date();
    const session = new RecallSession({
      id: 'session-dup-attempt',
      driverId: 'driver-dup',
      routeId: 'route-66',
      targetVariantKey: 'variant-key',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: 'NEXT_STOP::s1->s2',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: 's2',
      currentPromptStartedAt: startedAt,
      startedAt,
      completedAt: null,
      abandonedAt: null,
    });
    await repository.createSession(session);

    const attempt1 = new RecallAttempt({
      id: 'attempt-first',
      sessionId: 'session-dup-attempt',
      promptIndex: 0,
      cardKey: 'NEXT_STOP::s1->s2',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 's2',
      expectedAnswer: 's2',
      outcome: RecallOutcome.PASS,
      startedAt,
      answeredAt: new Date(),
    });

    const nextSession = session.advanceCursor({
      nextPromptIndex: 1,
      nextCardKey: 'NEXT_STOP::s2->s3',
      nextRecallMode: RecallMode.NEXT_STOP_FORWARD,
      nextExpectedAnswer: 's3',
      nextPromptStartedAt: new Date(),
    });
    await repository.saveAttemptAndAdvanceSession(attempt1, nextSession);

    // Try to record another attempt with same promptIndex 0
    const duplicateAttempt = new RecallAttempt({
      id: 'attempt-second',
      sessionId: 'session-dup-attempt',
      promptIndex: 0,
      cardKey: 'NEXT_STOP::s1->s2',
      recallMode: RecallMode.NEXT_STOP_FORWARD,
      rawInput: 's2',
      expectedAnswer: 's2',
      outcome: RecallOutcome.PASS,
      startedAt,
      answeredAt: new Date(),
    });

    await expect(
      repository.saveAttemptAndAdvanceSession(duplicateAttempt, nextSession),
    ).rejects.toThrow();
  });

  it('(4) sequential session completion allows subsequent sessions to be created for same variant', async () => {
    const session1 = new RecallSession({
      id: 'session-seq-1',
      driverId: 'driver-seq',
      routeId: 'route-66',
      targetVariantKey: 'variant-seq',
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
    await repository.createSession(session1);

    // Complete session 1
    const completedSession1 = session1.complete();
    await repository.updateSessionStatus(completedSession1);

    expect(await repository.findActiveSession('driver-seq', 'variant-seq')).toBeNull();

    // Now starting session 2 for same driver and variant succeeds cleanly
    const session2 = new RecallSession({
      id: 'session-seq-2',
      driverId: 'driver-seq',
      routeId: 'route-66',
      targetVariantKey: 'variant-seq',
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
    const created2 = await repository.createSession(session2);
    expect(created2.id).toBe('session-seq-2');
  });

  it('(5) provides cross-driver session isolation (driver-alice vs driver-bob)', async () => {
    const sessionAlice = new RecallSession({
      id: 'session-alice',
      driverId: 'driver-alice',
      routeId: 'route-66',
      targetVariantKey: 'variant-shared',
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

    const sessionBob = new RecallSession({
      id: 'session-bob',
      driverId: 'driver-bob',
      routeId: 'route-66',
      targetVariantKey: 'variant-shared',
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

    // Both can have an active session for the same variant concurrently!
    await repository.createSession(sessionAlice);
    await repository.createSession(sessionBob);

    const activeAlice = await repository.findActiveSession('driver-alice', 'variant-shared');
    const activeBob = await repository.findActiveSession('driver-bob', 'variant-shared');

    expect(activeAlice?.id).toBe('session-alice');
    expect(activeBob?.id).toBe('session-bob');
  });

  it('(6) GTFS table independence: purging GTFS tables leaves recall sessions and attempts intact', async () => {
    const session = new RecallSession({
      id: 'session-independent',
      driverId: 'driver-indep',
      routeId: 'route-unconstrained',
      targetVariantKey: 'variant-unconstrained',
      status: SessionStatus.IN_PROGRESS,
      currentPromptIndex: 0,
      currentCardKey: 'NEXT_STOP::st_a->st_b',
      currentRecallMode: RecallMode.NEXT_STOP_FORWARD,
      currentExpectedAnswer: 'st_b',
      currentPromptStartedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: null,
    });
    await repository.createSession(session);

    // Purging GTFS stops or routes has zero foreign key effect on recall_session
    await prisma.gtfsStopTime.deleteMany();
    await prisma.gtfsTrip.deleteMany();
    await prisma.gtfsRoute.deleteMany();
    await prisma.gtfsStop.deleteMany();

    const retrieved = await repository.findById('session-independent');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.routeId).toBe('route-unconstrained');
  });

  it('(7) preserves plannedCardIds array and ordering across database round-trip (Phase 2)', async () => {
    const plannedCards = ['card-alpha', 'card-beta', 'card-gamma'];
    const session = new RecallSession({
      id: 'session-planned-order',
      driverId: 'driver-p2',
      routeId: 'route-66',
      targetVariantKey: 'var-order',
      status: SessionStatus.IN_PROGRESS,
      plannedCardIds: plannedCards,
      currentPromptIndex: 0,
      currentCardKey: null,
      currentRecallMode: null,
      currentExpectedAnswer: null,
      currentPromptStartedAt: null,
      startedAt: new Date('2026-09-11T10:00:00Z'),
      completedAt: null,
      abandonedAt: null,
    });

    await repository.createSession(session);

    const retrieved = await repository.findById('session-planned-order');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.plannedCardIds).toEqual(plannedCards);
    expect(retrieved?.plannedCardIds[0]).toBe('card-alpha');
    expect(retrieved?.plannedCardIds[1]).toBe('card-beta');
    expect(retrieved?.plannedCardIds[2]).toBe('card-gamma');
  });

  it('(8) persists and retrieves all 5 resulting SRS snapshot fields on RecallAttempt (Phase 2)', async () => {
    const session = new RecallSession({
      id: 'session-srs-snapshot',
      driverId: 'driver-p2',
      routeId: 'route-66',
      targetVariantKey: 'var-srs',
      status: SessionStatus.IN_PROGRESS,
      plannedCardIds: ['card-1', 'card-2'],
      currentPromptIndex: 0,
      currentCardKey: 'card-1',
      currentRecallMode: RecallMode.STOP_NAME_RECOGNITION,
      currentExpectedAnswer: 'Stop 1',
      currentPromptStartedAt: new Date('2026-09-11T10:00:00Z'),
      startedAt: new Date('2026-09-11T10:00:00Z'),
      completedAt: null,
      abandonedAt: null,
    });
    await repository.createSession(session);

    const reviewDate = new Date('2026-09-18T10:00:00Z');
    const attempt = new RecallAttempt({
      id: 'attempt-srs-1',
      sessionId: 'session-srs-snapshot',
      promptIndex: 0,
      cardKey: 'card-1',
      recallMode: RecallMode.STOP_NAME_RECOGNITION,
      rawInput: 'Stop 1',
      expectedAnswer: 'Stop 1',
      outcome: RecallOutcome.PASS,
      startedAt: new Date('2026-09-11T10:00:00Z'),
      answeredAt: new Date('2026-09-11T10:00:05Z'),
      durationMs: 5000,
      resultingState: CardState.REVIEW,
      resultingSrsLevel: 3,
      resultingNextReviewAt: reviewDate,
      resultingRepetitions: 4,
      resultingLapses: 1,
    });

    const advancedSession = new RecallSession({
      ...session,
      currentPromptIndex: 1,
      plannedCardIds: session.plannedCardIds,
    });

    await repository.saveAttemptAndAdvanceSession(attempt, advancedSession);

    // Direct find by index
    const retrievedAttempt = await repository.findAttemptBySessionAndIndex('session-srs-snapshot', 0);
    expect(retrievedAttempt).not.toBeNull();
    expect(retrievedAttempt?.resultingState).toBe(CardState.REVIEW);
    expect(retrievedAttempt?.resultingSrsLevel).toBe(3);
    expect(retrievedAttempt?.resultingNextReviewAt).toEqual(reviewDate);
    expect(retrievedAttempt?.resultingRepetitions).toBe(4);
    expect(retrievedAttempt?.resultingLapses).toBe(1);

    // Via findAttemptsBySessionId
    const attempts = await repository.findAttemptsBySessionId('session-srs-snapshot');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].resultingState).toBe(CardState.REVIEW);
    expect(attempts[0].resultingSrsLevel).toBe(3);
    expect(attempts[0].resultingNextReviewAt).toEqual(reviewDate);
    expect(attempts[0].resultingRepetitions).toBe(4);
    expect(attempts[0].resultingLapses).toBe(1);
  });

  it('(9) database strictly rejects duplicate (sessionId, promptIndex) insertion via unique constraint (Phase 2)', async () => {
    const session = new RecallSession({
      id: 'session-idempotency-db',
      driverId: 'driver-idemp',
      routeId: 'route-66',
      targetVariantKey: 'var-idemp',
      status: SessionStatus.IN_PROGRESS,
      plannedCardIds: ['card-x'],
      currentPromptIndex: 0,
      currentCardKey: 'card-x',
      currentRecallMode: RecallMode.STOP_NAME_RECOGNITION,
      currentExpectedAnswer: 'ans',
      currentPromptStartedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      abandonedAt: null,
    });
    await repository.createSession(session);

    // Insert first attempt directly into DB
    await prisma.recallAttempt.create({
      data: {
        id: 'attempt-unique-1',
        sessionId: 'session-idempotency-db',
        promptIndex: 0,
        cardKey: 'card-x',
        recallMode: RecallMode.STOP_NAME_RECOGNITION,
        rawInput: 'first',
        expectedAnswer: 'ans',
        outcome: RecallOutcome.PASS,
        startedAt: new Date(),
        answeredAt: new Date(),
        durationMs: 1000,
        resultingState: CardState.REVIEW,
        resultingSrsLevel: 1,
        resultingRepetitions: 1,
        resultingLapses: 0,
      },
    });

    // Attempting second insert with same (sessionId, promptIndex) MUST fail with unique constraint violation (P2002)
    await expect(
      prisma.recallAttempt.create({
        data: {
          id: 'attempt-unique-2',
          sessionId: 'session-idempotency-db',
          promptIndex: 0,
          cardKey: 'card-x',
          recallMode: RecallMode.STOP_NAME_RECOGNITION,
          rawInput: 'duplicate-or-conflict',
          expectedAnswer: 'ans',
          outcome: RecallOutcome.FAIL,
          startedAt: new Date(),
          answeredAt: new Date(),
          durationMs: 1200,
          resultingState: CardState.LEARNING,
          resultingSrsLevel: 0,
          resultingRepetitions: 0,
          resultingLapses: 1,
        },
      }),
    ).rejects.toThrow();
  });
});
