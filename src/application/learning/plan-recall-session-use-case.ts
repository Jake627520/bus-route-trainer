import { Clock } from '@/application/common/clock';
import { DueLearningCardsQueryPort } from '@/application/learning/due-learning-cards-query-port';
import { NewLearningCardsQueryPort } from '@/application/learning/new-learning-cards-query-port';
import { LearningCard } from '@/domain/learning/learning-card';
import {
  DEFAULT_SESSION_SIZE,
  RecallQueueCandidate,
  selectRecallQueue,
} from '@/domain/learning/recall-queue-policy';
import { RecallSessionPlan } from '@/domain/learning/recall-session-plan';

export interface PlanRecallSessionCommand {
  readonly sessionId: string;
  readonly driverId: string;
  readonly variantKey: string;
  readonly sessionSize?: number;
  readonly dueRatio?: number;
  readonly excludedCardIds?: ReadonlySet<string>;
}

export interface PlanRecallSessionResult {
  readonly plan: RecallSessionPlan | null;
  readonly selectedDueCount: number;
  readonly selectedNewCount: number;
  readonly totalEligibleCount: number;
}

export class PlanRecallSessionUseCase {
  constructor(
    private readonly dueCardsQuery: DueLearningCardsQueryPort,
    private readonly newCardsQuery: NewLearningCardsQueryPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: PlanRecallSessionCommand): Promise<PlanRecallSessionResult> {
    const authoritativeNow = this.clock.now();

    // Query candidate pools without limit to prevent candidate starvation
    const [dueCards, newCards] = await Promise.all([
      this.dueCardsQuery.findDueCards({
        driverId: command.driverId,
        variantKey: command.variantKey,
        now: authoritativeNow,
      }),
      this.newCardsQuery.findNewCards({
        driverId: command.driverId,
        variantKey: command.variantKey,
      }),
    ]);

    const toCandidate = (card: LearningCard): RecallQueueCandidate => ({
      cardId: card.id,
      state: card.state,
      nextReviewAt: card.nextReviewAt,
    });

    const sessionSize = command.sessionSize ?? DEFAULT_SESSION_SIZE;

    const result = selectRecallQueue({
      dueCards: dueCards.map(toCandidate),
      newCards: newCards.map(toCandidate),
      now: authoritativeNow,
      sessionSize,
      dueRatio: command.dueRatio,
      excludedCardIds: command.excludedCardIds,
    });

    if (result.cardIds.length === 0) {
      return {
        plan: null,
        selectedDueCount: 0,
        selectedNewCount: 0,
        totalEligibleCount: result.eligibleDueCount + result.eligibleNewCount,
      };
    }

    const plan = new RecallSessionPlan({
      sessionId: command.sessionId,
      cardIds: result.cardIds,
      createdAt: authoritativeNow,
    });

    return {
      plan,
      selectedDueCount: result.selectedDueCount,
      selectedNewCount: result.selectedNewCount,
      totalEligibleCount: result.eligibleDueCount + result.eligibleNewCount,
    };
  }
}
