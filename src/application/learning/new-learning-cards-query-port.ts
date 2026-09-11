import { LearningCard } from '@/domain/learning/learning-card';

export interface FindNewCardsParams {
  readonly driverId: string;
  readonly variantKey: string;
  readonly limit?: number;
}

export interface NewLearningCardsQueryPort {
  findNewCards(params: FindNewCardsParams): Promise<LearningCard[]>;
}
