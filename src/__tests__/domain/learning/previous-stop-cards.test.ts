import { describe, it, expect } from 'vitest';
import {
  generateCardsForOrderedStops,
  generatePreviousStopCardKey,
  parsePreviousStopCardKey,
  hasPreviousStopCard,
} from '@/domain/learning/card-key-generator';
import { CardType } from '@/domain/learning/learning-card';

describe('Change 50: PREV_STOP card keys', () => {
  it('builds the key in the same from->to orientation as NEXT_STOP', () => {
    expect(generatePreviousStopCardKey('A', 'B')).toBe('PREV_STOP::A->B');
  });
  it('rejects empty ids', () => {
    expect(() => generatePreviousStopCardKey('', 'B')).toThrow();
    expect(() => generatePreviousStopCardKey('A', '')).toThrow();
  });
  it('parses a key back into from/to', () => {
    expect(parsePreviousStopCardKey('PREV_STOP::A->B')).toEqual({ fromStopId: 'A', toStopId: 'B' });
  });
  it('returns null for other kinds of keys or malformed ones', () => {
    expect(parsePreviousStopCardKey('NEXT_STOP::A->B')).toBeNull();
    expect(parsePreviousStopCardKey('STOP::A')).toBeNull();
    expect(parsePreviousStopCardKey('PREV_STOP::A')).toBeNull();
    expect(parsePreviousStopCardKey('PREV_STOP::->B')).toBeNull();
  });
});

describe('Change 50: hasPreviousStopCard (no card when the hint would be the answer)', () => {
  it('is true for two different stop names', () => {
    expect(hasPreviousStopCard('Roma Street', 'Cultural Centre')).toBe(true);
  });
  it('is false when the names are equal after lenient normalisation', () => {
    expect(hasPreviousStopCard('Queen St', 'queen st.')).toBe(false);
    expect(hasPreviousStopCard('Roma Street', 'Roma Street')).toBe(false);
  });
  it('is true when names are unknown (cannot tell)', () => {
    expect(hasPreviousStopCard(undefined, 'B')).toBe(true);
    expect(hasPreviousStopCard('A', undefined)).toBe(true);
  });
});

describe('Change 50: generateCardsForOrderedStops adds PREV_STOP cards', () => {
  const prev = (cards: ReturnType<typeof generateCardsForOrderedStops>) =>
    cards.filter((c) => c.cardType === CardType.PREV_STOP).map((c) => c.cardKey);

  it('creates one per adjacent pair — N stops give N-1, none for the first stop', () => {
    const cards = generateCardsForOrderedStops('p1', ['A', 'B', 'C']);
    expect(prev(cards)).toEqual(['PREV_STOP::A->B', 'PREV_STOP::B->C']);
  });

  it('keeps NEXT_STOP cards untouched (independent card for the same pair)', () => {
    const cards = generateCardsForOrderedStops('p1', ['A', 'B', 'C']);
    const next = cards.filter((c) => c.cardType === CardType.NEXT_STOP).map((c) => c.cardKey);
    expect(next).toEqual(['NEXT_STOP::A->B', 'NEXT_STOP::B->C']);
  });

  it('a single stop has no PREV_STOP card', () => {
    expect(prev(generateCardsForOrderedStops('p1', ['A']))).toEqual([]);
  });

  it('skips a pair whose two stop names are the same', () => {
    const cards = generateCardsForOrderedStops('p1', ['A', 'B', 'C'], ['Queen St', 'queen st.', 'Roma Street']);
    expect(prev(cards)).toEqual(['PREV_STOP::B->C']);
  });

  it('every card id is unique and every card starts NEW', () => {
    const cards = generateCardsForOrderedStops('p1', ['A', 'B', 'C', 'D']);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(cards.every((c) => c.state === 'NEW')).toBe(true);
  });
});
