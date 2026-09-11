import { PrismaClient } from '@prisma/client';
import { PrismaRecallRepository } from './prisma-recall-repository';
import { PrismaLearningProgressRepository } from '../learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '../gtfs/query/prisma-gtfs-read-repository';
import { PrismaRecallSettlementCoordinator } from '../learning/prisma-recall-settlement-coordinator';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { SubmitRecallAnswerUseCase } from '@/application/recall/submit-recall-answer-use-case';
import { StartRecallSessionUseCase } from '@/application/recall/start-recall-session-use-case';
import { GetCurrentRecallPromptUseCase } from '@/application/recall/get-current-recall-prompt-use-case';
import { CompleteRecallSessionUseCase } from '@/application/recall/complete-recall-session-use-case';
import {
  PromptSelectionStrategy,
  SequentialTopologyPromptStrategy,
} from '@/domain/recall/prompt-selection-strategy';

export interface RecallUseCases {
  startSession: StartRecallSessionUseCase;
  getPrompt: GetCurrentRecallPromptUseCase;
  submitAnswer: SubmitRecallAnswerUseCase;
  completeSession: CompleteRecallSessionUseCase;
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
  const getPrompt = new GetCurrentRecallPromptUseCase(recallRepo);
  const submitAnswer = new SubmitRecallAnswerUseCase(
    recallRepo,
    learningRepo,
    getRouteVariantsUseCase,
    promptStrategy,
    coordinator, // Explicit, mandatory Change 06 coordinator injection
  );
  const completeSession = new CompleteRecallSessionUseCase(recallRepo);

  return {
    startSession,
    getPrompt,
    submitAnswer,
    completeSession,
    coordinator,
  };
}
