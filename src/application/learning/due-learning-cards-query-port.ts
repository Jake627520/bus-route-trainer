import { LearningCard } from '@/domain/learning/learning-card';

export interface FindDueCardsParams {
  readonly driverId: string;
  readonly variantKey: string;
  readonly now: Date;
  readonly limit?: number;
}

export interface DueLearningCardsQueryPort {
  findDueCards(params: FindDueCardsParams): Promise<LearningCard[]>;
}
