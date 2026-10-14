import { describe, it, expect, vi } from 'vitest';
import {
  BackfillVariantCardsUseCase,
  CURRENT_CARDS_VERSION,
} from '@/application/learning/backfill-variant-cards-use-case';

/**
 * Change 46: 既有報名補發新題型卡片。
 * Change 45 才引入 STOP_NUM:: 卡、Change 50 才引入 PREV_STOP:: 卡，
 * 先前報名的人不會有，補卡機制負責補上，且**不得影響既有卡片的 SRS 進度**。
 */
const variant = {
  variantKey: 'R1_DIR0_A>B',
  directionId: 0,
  orderedStops: [
    { stopId: 'A', stopName: 'Freesia St at Muirfield Street, stop 85' },
    { stopId: 'B', stopName: 'Griffith University station, platform 1' },
  ],
};

function deps(existingCardKeys: string[], cardsVersion = 0) {
  const added: { progressId: string; cardKeys: string[]; version: number }[] = [];
  const repo = {
    findProgressForBackfill: vi.fn(async () => ({
      id: 'p1',
      routeId: 'R1',
      targetVariantKey: variant.variantKey,
      cardsVersion,
      cardKeys: existingCardKeys,
    })),
    addCardsAndSetVersion: vi.fn(async (progressId: string, cards: { cardKey: string }[], version: number) => {
      added.push({ progressId, cardKeys: cards.map((c) => c.cardKey), version });
    }),
  };
  const variants = { execute: vi.fn(async () => [variant]) };
  return { repo, variants, added };
}

describe('Change 46: BackfillVariantCardsUseCase', () => {
  it('adds only the missing STOP_NUM and PREV_STOP cards and bumps the version', async () => {
    // 舊報名：只有 STOP:: 與 NEXT_STOP:: 卡
    const { repo, variants, added } = deps(['STOP::A', 'STOP::B', 'NEXT_STOP::A->B']);
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);

    const result = await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });

    expect(result.added).toBe(2);
    expect(added).toHaveLength(1);
    // 站號卡只補 A（有 stop 85；B 是月台沒有站號）；上一站卡補 A->B
    expect(added[0].cardKeys).toEqual(['STOP_NUM::A', 'PREV_STOP::A->B']);
    expect(added[0].version).toBe(CURRENT_CARDS_VERSION);
  });

  it('never touches or re-creates existing cards', async () => {
    const { repo, variants, added } = deps(['STOP::A', 'STOP::B', 'NEXT_STOP::A->B']);
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });
    const written = added[0].cardKeys;
    expect(written).not.toContain('STOP::A');
    expect(written).not.toContain('NEXT_STOP::A->B');
  });

  it('is a no-op when the progress is already at the current version', async () => {
    const { repo, variants, added } = deps([], CURRENT_CARDS_VERSION);
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    const result = await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(true);
    expect(added).toHaveLength(0);
    // O(1)：連變體拓撲都不該去查
    expect(variants.execute).not.toHaveBeenCalled();
  });

  it('still bumps the version when nothing is missing, so it only runs once', async () => {
    const { repo, variants, added } = deps(['STOP::A', 'STOP::B', 'NEXT_STOP::A->B', 'STOP_NUM::A', 'PREV_STOP::A->B']);
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    const result = await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });
    expect(result.added).toBe(0);
    expect(added[0].cardKeys).toEqual([]);
    expect(added[0].version).toBe(CURRENT_CARDS_VERSION);
  });

  it('is a no-op when the driver is not enrolled', async () => {
    const repo = { findProgressForBackfill: vi.fn(async () => null), addCardsAndSetVersion: vi.fn() };
    const variants = { execute: vi.fn() };
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    const result = await uc.execute({ driverId: 'd1', variantKey: 'nope' });
    expect(result.added).toBe(0);
    expect(repo.addCardsAndSetVersion).not.toHaveBeenCalled();
  });

  // Change 50
  it('the card-set version is 2 (PREV_STOP cards were introduced after STOP_NUM)', () => {
    expect(CURRENT_CARDS_VERSION).toBe(2);
  });

  it('a version-1 enrolment (already has STOP_NUM) only gets the PREV_STOP cards', async () => {
    const { repo, variants, added } = deps(['STOP::A', 'STOP::B', 'NEXT_STOP::A->B', 'STOP_NUM::A'], 1);
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    const result = await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });
    expect(result.added).toBe(1);
    expect(added[0].cardKeys).toEqual(['PREV_STOP::A->B']);
    expect(added[0].version).toBe(2);
  });

  it('does not re-add a PREV_STOP card the driver already has (SRS untouched)', async () => {
    const { repo, variants, added } = deps(
      ['STOP::A', 'STOP::B', 'NEXT_STOP::A->B', 'STOP_NUM::A', 'PREV_STOP::A->B'],
      1,
    );
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });
    expect(added[0].cardKeys).toEqual([]);
  });

  it('skips a PREV_STOP card for adjacent stops that share a name', async () => {
    const same = {
      ...variant,
      orderedStops: [
        { stopId: 'A', stopName: 'Queen St' },
        { stopId: 'B', stopName: 'queen st.' },
        { stopId: 'C', stopName: 'Roma Street' },
      ],
    };
    const { repo, variants, added } = deps(['STOP::A', 'STOP::B', 'STOP::C', 'NEXT_STOP::A->B', 'NEXT_STOP::B->C'], 1);
    variants.execute = vi.fn(async () => [same]);
    const uc = new BackfillVariantCardsUseCase(repo as never, variants as never);
    await uc.execute({ driverId: 'd1', variantKey: variant.variantKey });
    expect(added[0].cardKeys).toEqual(['PREV_STOP::B->C']);
  });
});
