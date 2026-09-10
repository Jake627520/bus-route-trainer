import { describe, it, expect } from 'vitest';
import {
  DriverVariantProgress,
  ProgressStatus,
} from '@/domain/learning/driver-variant-progress';
import { LearningCard, CardType } from '@/domain/learning/learning-card';

describe('DriverVariantProgress Aggregate', () => {
  it('instantiates with default status NOT_STARTED and empty cards', () => {
    const progress = new DriverVariantProgress({
      id: 'prog_1',
      driverId: 'driver_default_local',
      routeId: 'R66',
      directionId: 0,
      targetVariantKey: 'R66_DIR0_place_rbwh>place_uq_lakes',
    });

    expect(progress.id).toBe('prog_1');
    expect(progress.driverId).toBe('driver_default_local');
    expect(progress.routeId).toBe('R66');
    expect(progress.directionId).toBe(0);
    expect(progress.targetVariantKey).toBe('R66_DIR0_place_rbwh>place_uq_lakes');
    expect(progress.status).toBe(ProgressStatus.NOT_STARTED);
    expect(progress.lastStudiedAt).toBeNull();
    expect(progress.cards).toHaveLength(0);
    expect(progress.enrolledAt).toBeInstanceOf(Date);
  });

  it('validates required fields and directionId bounds', () => {
    expect(
      () =>
        new DriverVariantProgress({
          id: '',
          driverId: 'driver_1',
          routeId: 'R66',
          directionId: 0,
          targetVariantKey: 'key_1',
        })
    ).toThrow();

    expect(
      () =>
        new DriverVariantProgress({
          id: 'p1',
          driverId: '',
          routeId: 'R66',
          directionId: 0,
          targetVariantKey: 'key_1',
        })
    ).toThrow();

    expect(
      () =>
        new DriverVariantProgress({
          id: 'p1',
          driverId: 'd1',
          routeId: '',
          directionId: 0,
          targetVariantKey: 'key_1',
        })
    ).toThrow();

    expect(
      () =>
        new DriverVariantProgress({
          id: 'p1',
          driverId: 'd1',
          routeId: 'r1',
          directionId: 2 as unknown as number,
          targetVariantKey: 'key_1',
        })
    ).toThrow();
  });

  it('attaches frozen cards array and remains immutable', () => {
    const card = new LearningCard({
      id: 'c1',
      progressId: 'p1',
      cardKey: 'STOP::s1',
      cardType: CardType.STOP,
    });

    const progress = new DriverVariantProgress({
      id: 'p1',
      driverId: 'd1',
      routeId: 'r1',
      directionId: 1,
      targetVariantKey: 'key_1',
      status: ProgressStatus.IN_PROGRESS,
      cards: [card],
    });

    expect(progress.cards).toHaveLength(1);
    expect(progress.cards[0].cardKey).toBe('STOP::s1');
    expect(Object.isFrozen(progress)).toBe(true);
    expect(Object.isFrozen(progress.cards)).toBe(true);
  });
});
