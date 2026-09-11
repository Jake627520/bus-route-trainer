import { SrsLevel } from '@/domain/srs/srs-interval-policy';

export enum CardType {
  STOP = 'STOP',
  NEXT_STOP = 'NEXT_STOP',
}

export enum CardState {
  NEW = 'NEW',
  LEARNING = 'LEARNING',
  REVIEW = 'REVIEW',
  MASTERED = 'MASTERED',
}

export interface LearningCardProps {
  id: string; // UUID v4 persistence identifier
  progressId: string; // UUID of parent progress
  cardKey: string; // Deterministic semantic key within progress
  cardType: CardType;
  state?: CardState;
  srsLevel?: SrsLevel;
  nextReviewAt?: Date | null;
  repetitions?: number;
  lapses?: number;
}

export class LearningCard {
  public readonly id: string;
  public readonly progressId: string;
  public readonly cardKey: string;
  public readonly cardType: CardType;
  public readonly state: CardState;
  public readonly srsLevel: SrsLevel;
  public readonly nextReviewAt: Date | null;
  public readonly repetitions: number;
  public readonly lapses: number;

  constructor(props: LearningCardProps) {
    if (!props.id) throw new Error('card id must not be empty');
    if (!props.progressId) throw new Error('progressId must not be empty');
    if (!props.cardKey) throw new Error('cardKey must not be empty');
    if (!Object.values(CardType).includes(props.cardType)) {
      throw new Error(`invalid CardType: ${props.cardType}`);
    }

    this.id = props.id;
    this.progressId = props.progressId;
    this.cardKey = props.cardKey;
    this.cardType = props.cardType;
    this.state = props.state ?? CardState.NEW;
    this.srsLevel = props.srsLevel ?? 0;
    this.nextReviewAt = props.nextReviewAt ?? null;
    this.repetitions = props.repetitions ?? 0;
    this.lapses = props.lapses ?? 0;

    Object.freeze(this);
  }
}
