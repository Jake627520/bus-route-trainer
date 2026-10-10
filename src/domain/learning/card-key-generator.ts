import { randomUUID } from 'crypto';
import { CardType, CardState, LearningCard } from './learning-card';
import { parseStopName } from '@/domain/gtfs/stop-name';

export function generateStopCardKey(stopId: string): string {
  if (!stopId) throw new Error('stopId must not be empty');
  return `STOP::${stopId}`;
}

export function generateNextStopCardKey(fromStopId: string, toStopId: string): string {
  if (!fromStopId || !toStopId) throw new Error('fromStopId and toStopId must not be empty');
  return `NEXT_STOP::${fromStopId}->${toStopId}`;
}

/** Change 45: 站號卡（只在站名含 stop 編號時產生）。 */
export function generateStopNumberCardKey(stopId: string): string {
  if (!stopId) throw new Error('stopId must not be empty');
  return `STOP_NUM::${stopId}`;
}

export function generateCardsForOrderedStops(
  progressId: string,
  orderedStopIds: string[],
  /**
   * Change 45: 各站站名（與 orderedStopIds 同序，選填）。
   * 有提供且站名含 stop 編號時，額外產生一張站號卡。
   */
  orderedStopNames?: readonly (string | undefined)[]
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

  // 1b. Change 45: 站名含 stop 編號者，額外產生站號卡
  if (orderedStopNames) {
    orderedStopIds.forEach((stopId, i) => {
      const parsed = parseStopName(orderedStopNames[i] ?? '');
      if (!parsed.stopNumber) return;
      cards.push(
        new LearningCard({
          id: randomUUID(),
          progressId,
          cardKey: generateStopNumberCardKey(stopId),
          cardType: CardType.STOP,
          state: CardState.NEW,
          nextReviewAt: null,
          repetitions: 0,
          lapses: 0,
        })
      );
    });
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
