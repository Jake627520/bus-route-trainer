import { RecallMode } from './recall-session';

export interface RecallPromptProps {
  promptId: string;
  sessionId: string;
  cardKey: string;
  promptIndex: number;
  recallMode: RecallMode;
  givenReference: string;
  expectedAnswer: string;
  createdAt?: Date;
}

export class RecallPrompt {
  public readonly promptId: string;
  public readonly sessionId: string;
  public readonly cardKey: string;
  public readonly promptIndex: number;
  public readonly recallMode: RecallMode;
  public readonly givenReference: string;
  public readonly expectedAnswer: string;
  public readonly createdAt: Date;

  constructor(props: RecallPromptProps) {
    this.promptId = props.promptId;
    this.sessionId = props.sessionId;
    this.cardKey = props.cardKey;
    this.promptIndex = props.promptIndex;
    this.recallMode = props.recallMode;
    this.givenReference = props.givenReference;
    this.expectedAnswer = props.expectedAnswer;
    this.createdAt = props.createdAt ?? new Date();
  }
}
