import { CardState } from '../learning/learning-card';
import { RecallMode, RecallOutcome } from './recall-session';

export interface RecallAttemptProps {
  id: string;
  sessionId: string;
  promptIndex: number;
  cardKey: string;
  recallMode: RecallMode;
  rawInput: string;
  expectedAnswer: string;
  outcome: RecallOutcome;
  startedAt: Date;
  answeredAt: Date;
  durationMs?: number;
  resultingState?: CardState;
  resultingSrsLevel?: number;
  resultingNextReviewAt?: Date | null;
  resultingRepetitions?: number;
  resultingLapses?: number;
}

export class RecallAttempt {
  public readonly id: string;
  public readonly sessionId: string;
  public readonly promptIndex: number;
  public readonly cardKey: string;
  public readonly recallMode: RecallMode;
  public readonly rawInput: string;
  public readonly expectedAnswer: string;
  public readonly outcome: RecallOutcome;
  public readonly startedAt: Date;
  public readonly answeredAt: Date;
  public readonly durationMs: number;
  public readonly resultingState: CardState;
  public readonly resultingSrsLevel: number;
  public readonly resultingNextReviewAt: Date | null;
  public readonly resultingRepetitions: number;
  public readonly resultingLapses: number;

  constructor(props: RecallAttemptProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.promptIndex = props.promptIndex;
    this.cardKey = props.cardKey;
    this.recallMode = props.recallMode;
    this.rawInput = props.rawInput;
    this.expectedAnswer = props.expectedAnswer;
    this.outcome = props.outcome;
    this.startedAt = props.startedAt;
    this.answeredAt = props.answeredAt;
    this.durationMs =
      props.durationMs ??
      Math.max(0, props.answeredAt.getTime() - props.startedAt.getTime());
    this.resultingState = props.resultingState ?? CardState.NEW;
    this.resultingSrsLevel = props.resultingSrsLevel ?? 0;
    this.resultingNextReviewAt = props.resultingNextReviewAt ?? null;
    this.resultingRepetitions = props.resultingRepetitions ?? 0;
    this.resultingLapses = props.resultingLapses ?? 0;
  }
}
