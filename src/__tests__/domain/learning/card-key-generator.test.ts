import { describe, it, expect } from 'vitest';
import {
  generateStopCardKey,
  generateNextStopCardKey,
  generateCardsForOrderedStops,
} from '@/domain/learning/card-key-generator';
import { CardType, CardState } from '@/domain/learning/learning-card';

describe('CardKeyGenerator & Topology Transition Semantics', () => {
  it('generates deterministic STOP and NEXT_STOP card keys without sequence numbers', () => {
    expect(generateStopCardKey('stop_100')).toBe('STOP::stop_100');
    expect(generateNextStopCardKey('stop_100', 'stop_101')).toBe('NEXT_STOP::stop_100->stop_101');

    // Reject empty stop IDs
    expect(() => generateStopCardKey('')).toThrow();
    expect(() => generateNextStopCardKey('', 'stop_101')).toThrow();
    expect(() => generateNextStopCardKey('stop_100', '')).toThrow();
  });

  it('Test A (topology semantics): preserves STOP cards across insertion; updates affected NEXT_STOP edges while preserving unaffected edges', () => {
    const progressId = 'prog_001';

    // Original topology: A -> B -> C
    const topology1 = ['stop_A', 'stop_B', 'stop_C'];
    const cards1 = generateCardsForOrderedStops(progressId, topology1);

    const stopKeys1 = cards1.filter((c) => c.cardType === CardType.STOP).map((c) => c.cardKey);
    const nextKeys1 = cards1.filter((c) => c.cardType === CardType.NEXT_STOP).map((c) => c.cardKey);

    expect(stopKeys1).toEqual(['STOP::stop_A', 'STOP::stop_B', 'STOP::stop_C']);
    expect(nextKeys1).toEqual(['NEXT_STOP::stop_A->stop_B', 'NEXT_STOP::stop_B->stop_C']);

    // Modified topology with intermediate stop inserted: A -> X -> B -> C
    const topology2 = ['stop_A', 'stop_X', 'stop_B', 'stop_C'];
    const cards2 = generateCardsForOrderedStops(progressId, topology2);

    const stopKeys2 = cards2.filter((c) => c.cardType === CardType.STOP).map((c) => c.cardKey);
    const nextKeys2 = cards2.filter((c) => c.cardType === CardType.NEXT_STOP).map((c) => c.cardKey);

    // 1. STOP cards for A, B, C are completely preserved with identical keys
    expect(stopKeys2).toContain('STOP::stop_A');
    expect(stopKeys2).toContain('STOP::stop_B');
    expect(stopKeys2).toContain('STOP::stop_C');
    expect(stopKeys2).toContain('STOP::stop_X');

    // 2. The edge A -> B is broken by insertion of X and is not generated in topology 2
    expect(nextKeys2).not.toContain('NEXT_STOP::stop_A->stop_B');

    // 3. New adjacent transitions A -> X and X -> B are generated
    expect(nextKeys2).toContain('NEXT_STOP::stop_A->stop_X');
    expect(nextKeys2).toContain('NEXT_STOP::stop_X->stop_B');

    // 4. Downstream unaffected edge B -> C remains identical and stable
    expect(nextKeys2).toContain('NEXT_STOP::stop_B->stop_C');
  });

  it('single-stop boundary case produces 1 STOP card and 0 NEXT_STOP cards', () => {
    const progressId = 'prog_single';
    const singleStopTopology = ['stop_terminus_only'];
    const cards = generateCardsForOrderedStops(progressId, singleStopTopology);

    expect(cards).toHaveLength(1);
    expect(cards[0].cardType).toBe(CardType.STOP);
    expect(cards[0].cardKey).toBe('STOP::stop_terminus_only');
    expect(cards[0].state).toBe(CardState.NEW);
    expect(cards[0].repetitions).toBe(0);
    expect(cards[0].lapses).toBe(0);
    expect(cards[0].nextReviewAt).toBeNull();
  });

  it('rejects empty stop list', () => {
    expect(() => generateCardsForOrderedStops('prog_1', [])).toThrow();
  });
});
