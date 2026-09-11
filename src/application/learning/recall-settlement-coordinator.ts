import { RecallMode, RecallOutcome, RecallSession } from '@/domain/recall/recall-session';
import { RecallAttempt } from '@/domain/recall/recall-attempt';
import { LearningCard } from '@/domain/learning/learning-card';
import { ProgressStatus } from '@/domain/learning/driver-variant-progress';

export interface SettleRecallAttemptInput {
  readonly sessionId: string;
  readonly promptIndex: number;
  readonly driverId: string;
  readonly targetVariantKey: string;
  readonly cardKey: string;
  readonly recallMode: RecallMode;
  readonly rawInput: string;
  readonly expectedAnswer: string;
  readonly outcome: RecallOutcome;
  readonly startedAt: Date;
  readonly answeredAt: Date;
  readonly durationMs: number;
  readonly isLastPrompt: boolean;
  readonly nextPromptSnapshot?: {
    readonly nextPromptIndex: number;
    readonly nextCardKey: string | null;
    readonly nextRecallMode: RecallMode | null;
    readonly nextExpectedAnswer: string | null;
    readonly nextPromptStartedAt: Date | null;
  };
}

export interface SettleRecallAttemptOutput {
  readonly attempt: RecallAttempt;
  readonly card: LearningCard;
  readonly progressStatus: ProgressStatus;
  readonly session: RecallSession;
  readonly isDuplicate: boolean;
}

export interface RecallSettlementCoordinator {
  settleAttempt(input: SettleRecallAttemptInput): Promise<SettleRecallAttemptOutput>;
}
