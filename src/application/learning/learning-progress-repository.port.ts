import { DriverVariantProgress, ProgressStatus } from '@/domain/learning/driver-variant-progress';
import { CardType, CardState } from '@/domain/learning/learning-card';

export interface DriverVariantProgressDto {
  id: string;
  driverId: string;
  routeId: string;
  directionId: number;
  targetVariantKey: string;
  status: ProgressStatus;
  enrolledAt: string; // ISO string
  lastStudiedAt: string | null;
  totalCards: number;
}

export interface LearningCardDto {
  id: string;
  cardKey: string;
  cardType: CardType;
  state: CardState;
  nextReviewAt: string | null; // ISO string or null
  repetitions: number;
  lapses: number;
  currentSequence: number | null; // 1-based index (for STOP) or departure index (for NEXT_STOP)
}

export interface DriverVariantProgressWithCardsDto extends DriverVariantProgressDto {
  cards: LearningCardDto[];
}

export interface LearningProgressRepository {
  findByDriverAndVariant(
    driverId: string,
    variantKey: string
  ): Promise<DriverVariantProgress | null>;

  findById(id: string): Promise<DriverVariantProgress | null>;

  /**
   * Atomic Persistence Contract:
   * MUST persist DriverVariantProgress and ALL associated LearningCard instances
   * within a single atomic database transaction.
   * If any card or progress insertion fails, 100% of the operation is rolled back,
   * leaving zero progress records and zero cards in the database.
   */
  saveProgressWithCards(progress: DriverVariantProgress): Promise<void>;
}
