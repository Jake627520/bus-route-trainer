export interface DriverAnswerProps {
  sessionId: string;
  promptIndex: number;
  rawInput: string;
  submittedAt?: Date;
}

export class DriverAnswer {
  public readonly sessionId: string;
  public readonly promptIndex: number;
  public readonly rawInput: string;
  public readonly submittedAt: Date;

  constructor(props: DriverAnswerProps) {
    this.sessionId = props.sessionId;
    this.promptIndex = props.promptIndex;
    this.rawInput = props.rawInput;
    this.submittedAt = props.submittedAt ?? new Date();
  }
}
