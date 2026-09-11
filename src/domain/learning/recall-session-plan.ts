export interface RecallSessionPlanProps {
  readonly sessionId: string;
  readonly cardIds: readonly string[];
  readonly createdAt: Date;
}

export class RecallSessionPlan {
  public readonly sessionId: string;
  public readonly cardIds: readonly string[];
  private readonly createdAtMs: number;

  constructor(props: RecallSessionPlanProps) {
    if (!props.sessionId) {
      throw new Error('sessionId must not be empty');
    }

    if (!props.cardIds || props.cardIds.length === 0) {
      throw new Error('Recall session cannot be empty');
    }

    const uniqueCardIds = new Set(props.cardIds);
    if (uniqueCardIds.size !== props.cardIds.length) {
      throw new Error('Recall session cannot contain duplicate cards');
    }

    this.sessionId = props.sessionId;
    this.cardIds = Object.freeze([...props.cardIds]);
    this.createdAtMs = props.createdAt.getTime();

    Object.freeze(this);
  }

  public get createdAt(): Date {
    return new Date(this.createdAtMs);
  }
}
