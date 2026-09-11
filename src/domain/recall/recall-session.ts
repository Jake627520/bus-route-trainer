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

export class RecallSessionCannotBeEmptyError extends Error {
  constructor(message: string = 'RecallSession cannot be created with empty plannedCardIds') {
    super(message);
    this.name = 'RecallSessionCannotBeEmptyError';
  }
}

export class DuplicateCardInSessionError extends Error {
  constructor(message: string = 'RecallSession cannot contain duplicate cardIds') {
    super(message);
    this.name = 'DuplicateCardInSessionError';
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
  plannedCardIds: readonly string[];
}

/**
 * @deprecated Temporary transitional props for pre-Change-08 callers pending Phase 2-5 migration.
 */
export interface LegacyRecallSessionProps {
  id: string;
  driverId: string;
  routeId: string;
  targetVariantKey: string;
  status: SessionStatus;
  currentPromptIndex: number;
  currentCardKey?: string | null;
  currentRecallMode?: RecallMode | null;
  currentExpectedAnswer?: string | null;
  currentPromptStartedAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  abandonedAt: Date | null;
  plannedCardIds?: readonly string[];
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
  public readonly plannedCardIds: readonly string[];

  constructor(props: RecallSessionProps);
  constructor(props: LegacyRecallSessionProps);
  constructor(props: RecallSessionProps | LegacyRecallSessionProps) {
    const planned =
      props.plannedCardIds ??
      (props.currentCardKey ? [props.currentCardKey] : ['legacy-card']);

    if (planned.length === 0) {
      throw new RecallSessionCannotBeEmptyError();
    }
    const uniqueCards = new Set(planned);
    if (uniqueCards.size !== planned.length) {
      throw new DuplicateCardInSessionError();
    }
    this.plannedCardIds = Object.freeze([...planned]);

    this.id = props.id;
    this.driverId = props.driverId;
    this.routeId = props.routeId;
    this.targetVariantKey = props.targetVariantKey;
    this.status = props.status;
    this.currentPromptIndex = props.currentPromptIndex;
    this.currentCardKey = props.currentCardKey ?? null;
    this.currentRecallMode = props.currentRecallMode ?? null;
    this.currentExpectedAnswer = props.currentExpectedAnswer ?? null;
    this.currentPromptStartedAt = props.currentPromptStartedAt;
    this.startedAt = props.startedAt;
    this.completedAt = props.completedAt;
    this.abandonedAt = props.abandonedAt;
  }

  advance(now: Date): this {
    if (this.status === SessionStatus.COMPLETED || this.status === SessionStatus.ABANDONED) {
      throw new InvalidStateTransitionError(
        `Cannot advance session with status '${this.status}'`
      );
    }
    const nextIndex = this.currentPromptIndex + 1;
    this.currentPromptIndex = nextIndex;
    this.currentPromptStartedAt = null;

    if (nextIndex >= this.plannedCardIds.length) {
      this.status = SessionStatus.COMPLETED;
      this.completedAt = now;
      this.currentRecallMode = null;
      this.currentExpectedAnswer = null;
    }

    return this;
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
    this.currentPromptIndex = this.plannedCardIds.length;
    this.currentPromptStartedAt = null;
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
    this.currentPromptStartedAt = null;
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
