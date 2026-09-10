import { randomUUID } from 'crypto';
import { CardType, CardState, LearningCard } from './learning-card';

export function generateStopCardKey(stopId: string): string {
  if (!stopId) throw new Error('stopId must not be empty');
  return `STOP::${stopId}`;
}

export function generateNextStopCardKey(fromStopId: string, toStopId: string): string {
  if (!fromStopId || !toStopId) throw new Error('fromStopId and toStopId must not be empty');
  return `NEXT_STOP::${fromStopId}->${toStopId}`;
}

export function generateCardsForOrderedStops(
  progressId: string,
  orderedStopIds: string[]
): LearningCard[] {
  if (!progressId) throw new Error('progressId must not be empty');
  if (!orderedStopIds || orderedStopIds.length === 0) {
    throw new Error('orderedStopIds must contain at least one stop');
  }

  const cards: LearningCard[] = [];

  // 1. Generate STOP cards for each unique or ordered stop
  for (const stopId of orderedStopIds) {
    cards.push(
      new LearningCard({
        id: randomUUID(),
        progressId,
        cardKey: generateStopCardKey(stopId),
        cardType: CardType.STOP,
        state: CardState.NEW,
        nextReviewAt: null,
        repetitions: 0,
        lapses: 0,
      })
    );
  }

  // 2. Generate NEXT_STOP cards for each adjacent directed pair
  for (let i = 0; i < orderedStopIds.length - 1; i++) {
    const fromStopId = orderedStopIds[i];
    const toStopId = orderedStopIds[i + 1];

    cards.push(
      new LearningCard({
        id: randomUUID(),
        progressId,
        cardKey: generateNextStopCardKey(fromStopId, toStopId),
        cardType: CardType.NEXT_STOP,
        state: CardState.NEW,
        nextReviewAt: null,
        repetitions: 0,
        lapses: 0,
      })
    );
  }

  return cards;
}
