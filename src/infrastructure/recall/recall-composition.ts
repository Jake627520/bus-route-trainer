import { PrismaClient } from '@prisma/client';
import { PrismaRecallRepository } from './prisma-recall-repository';
import { PrismaLearningProgressRepository } from '../learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '../gtfs/query/prisma-gtfs-read-repository';
import { PrismaRecallSettlementCoordinator } from '../learning/prisma-recall-settlement-coordinator';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { SubmitRecallAnswerUseCase } from '@/application/recall/submit-recall-answer-use-case';
import { StartRecallSessionUseCase } from '@/application/recall/start-recall-session-use-case';
import { StartPlannedRecallSessionUseCase } from '@/application/recall/start-planned-recall-session-use-case';
import { PrismaStartPlannedRecallSessionAdapter } from './prisma-start-planned-recall-session-adapter';
import { GetCurrentRecallPromptUseCase } from '@/application/recall/get-current-recall-prompt-use-case';
import { CompleteRecallSessionUseCase } from '@/application/recall/complete-recall-session-use-case';
import { GetCurrentSessionPromptUseCase } from '@/application/recall/get-current-session-prompt-use-case';
import { PrismaGetCurrentSessionPromptAdapter } from './prisma-get-current-session-prompt-adapter';
import { SubmitSessionAnswerUseCase } from '@/application/recall/submit-session-answer-use-case';
import { PrismaSubmitSessionAnswerAdapter } from './prisma-submit-session-answer-adapter';
import { AbandonRecallSessionUseCase } from '@/application/recall/abandon-recall-session-use-case';
import { PrismaAbandonRecallSessionAdapter } from './prisma-abandon-recall-session-adapter';
import {
  PromptSelectionStrategy,
  SequentialTopologyPromptStrategy,
} from '@/domain/recall/prompt-selection-strategy';

export interface RecallUseCases {
  startSession: StartRecallSessionUseCase;
  startPlannedSession: StartPlannedRecallSessionUseCase;
  getPrompt: GetCurrentRecallPromptUseCase;
  getSessionPrompt: GetCurrentSessionPromptUseCase;
  submitAnswer: SubmitRecallAnswerUseCase;
  submitSessionAnswer: SubmitSessionAnswerUseCase;
  completeSession: CompleteRecallSessionUseCase;
  abandonSession: AbandonRecallSessionUseCase;
  coordinator: PrismaRecallSettlementCoordinator;
}

/**
 * Production Composition Root for Recall Session domain.
 * Guarantees that SubmitRecallAnswerUseCase is wired with PrismaRecallSettlementCoordinator,
 * ensuring all production submissions execute Change 06 atomic settlement.
 */
export function createRecallUseCases(
  prisma: PrismaClient,
  promptStrategy: PromptSelectionStrategy = new SequentialTopologyPromptStrategy(),
): RecallUseCases {
  const recallRepo = new PrismaRecallRepository(prisma);
  const learningRepo = new PrismaLearningProgressRepository(prisma);
  const gtfsReadRepo = new PrismaGtfsReadRepository(prisma);
  const getRouteVariantsUseCase = new GetRouteVariantsUseCase(gtfsReadRepo);
  const coordinator = new PrismaRecallSettlementCoordinator(prisma);

  const startSession = new StartRecallSessionUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    promptStrategy,
  );
  const startPlannedPort = new PrismaStartPlannedRecallSessionAdapter(prisma);
  const startPlannedSession = new StartPlannedRecallSessionUseCase(startPlannedPort);
  const getPrompt = new GetCurrentRecallPromptUseCase(recallRepo);
  const getSessionPromptPort = new PrismaGetCurrentSessionPromptAdapter(prisma);
  const getSessionPrompt = new GetCurrentSessionPromptUseCase(getSessionPromptPort);
  const submitAnswer = new SubmitRecallAnswerUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    promptStrategy,
    coordinator, // Explicit, mandatory Change 06 coordinator injection
  );
  const submitSessionAnswerPort = new PrismaSubmitSessionAnswerAdapter(prisma);
  const submitSessionAnswer = new SubmitSessionAnswerUseCase(submitSessionAnswerPort);
  const completeSession = new CompleteRecallSessionUseCase(recallRepo);
  const abandonSessionPort = new PrismaAbandonRecallSessionAdapter(prisma);
  const abandonSession = new AbandonRecallSessionUseCase(abandonSessionPort);

  return {
    startSession,
    startPlannedSession,
    getPrompt,
    getSessionPrompt,
    submitAnswer,
    submitSessionAnswer,
    completeSession,
    abandonSession,
    coordinator,
  };
}
