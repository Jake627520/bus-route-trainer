export enum SessionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum RecallMode {
  NEXT_STOP_FORWARD = 'NEXT_STOP_FORWARD',
  STOP_NAME_RECOGNITION = 'STOP_NAME_RECOGNITION',
}

export enum RecallOutcome {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export class InvalidStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStateTransitionError';
  }
}

export interface RecallSessionProps {
  id: string;
  driverId: string;
  routeId: string;
  targetVariantKey: string;
  status: SessionStatus;
  currentPromptIndex: number;
  currentCardKey: string | null;
  currentRecallMode: RecallMode | null;
  currentExpectedAnswer: string | null;
  currentPromptStartedAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  abandonedAt: Date | null;
}

export interface AdvanceCursorCommand {
  nextPromptIndex: number;
  nextCardKey: string | null;
  nextRecallMode: RecallMode | null;
  nextExpectedAnswer: string | null;
  nextPromptStartedAt: Date | null;
}

export class RecallSession {
  public readonly id: string;
  public readonly driverId: string;
  public readonly routeId: string;
  public readonly targetVariantKey: string;
  public status: SessionStatus;
  public currentPromptIndex: number;
  public currentCardKey: string | null;
  public currentRecallMode: RecallMode | null;
  public currentExpectedAnswer: string | null;
  public currentPromptStartedAt: Date | null;
  public readonly startedAt: Date;
  public completedAt: Date | null;
  public abandonedAt: Date | null;

  constructor(props: RecallSessionProps) {
    this.id = props.id;
    this.driverId = props.driverId;
    this.routeId = props.routeId;
    this.targetVariantKey = props.targetVariantKey;
    this.status = props.status;
    this.currentPromptIndex = props.currentPromptIndex;
    this.currentCardKey = props.currentCardKey;
    this.currentRecallMode = props.currentRecallMode;
    this.currentExpectedAnswer = props.currentExpectedAnswer;
    this.currentPromptStartedAt = props.currentPromptStartedAt;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.abandonedAt = props.abandonedAt;
  }

  complete(timestamp: Date = new Date()): this {
    if (this.status === SessionStatus.COMPLETED) {
      return this; // Idempotent
    }
    if (this.status === SessionStatus.ABANDONED) {
      throw new InvalidStateTransitionError('Cannot complete an abandoned session');
    }
    this.status = SessionStatus.COMPLETED;
    this.completedAt = timestamp;
    this.currentRecallMode = null;
    this.currentExpectedAnswer = null;
    return this;
  }

  abandon(timestamp: Date = new Date()): this {
    if (this.status === SessionStatus.ABANDONED) {
      return this; // Idempotent
    }
    if (this.status === SessionStatus.COMPLETED) {
      throw new InvalidStateTransitionError('Cannot abandon a completed session');
    }
    this.status = SessionStatus.ABANDONED;
    this.abandonedAt = timestamp;
    this.currentRecallMode = null;
    this.currentExpectedAnswer = null;
    return this;
  }

  advanceCursor(command: AdvanceCursorCommand): this {
    if (this.status !== SessionStatus.IN_PROGRESS) {
      throw new InvalidStateTransitionError(
        `Cannot advance cursor in session with status '${this.status}'`
      );
    }
    this.currentPromptIndex = command.nextPromptIndex;
    this.currentCardKey = command.nextCardKey;
    this.currentRecallMode = command.nextRecallMode;
    this.currentExpectedAnswer = command.nextExpectedAnswer;
    this.currentPromptStartedAt = command.nextPromptStartedAt;
    return this;
  }
}
