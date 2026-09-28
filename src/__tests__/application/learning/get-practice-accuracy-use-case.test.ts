import { describe, it, expect } from 'vitest';
import { GetPracticeAccuracyUseCase } from '@/application/learning/get-practice-accuracy-use-case';
import { PracticeStatsQueryPort } from '@/application/learning/practice-stats-query-port';

/**
 * Change 20 Task 3: GetPracticeAccuracyUseCase（純邏輯 fake port）。
 */
describe('Change 20: GetPracticeAccuracyUseCase', () => {
  const port = (total: number, passed: number): PracticeStatsQueryPort => ({
    countOutcomesByDriver: async () => ({ total, passed }),
    findAttemptDates: async () => [],
  });

  it('computes accuracy = passed / total', async () => {
    const useCase = new GetPracticeAccuracyUseCase(port(4, 3));
    expect(await useCase.execute({ driverId: 'd' })).toEqual({
      totalAttempts: 4,
      passedAttempts: 3,
      accuracy: 0.75,
    });
  });

  it('is 1 when all passed', async () => {
    const useCase = new GetPracticeAccuracyUseCase(port(5, 5));
    expect((await useCase.execute({ driverId: 'd' })).accuracy).toBe(1);
  });

  it('is 0 (not NaN) when there are no attempts', async () => {
    const useCase = new GetPracticeAccuracyUseCase(port(0, 0));
    expect(await useCase.execute({ driverId: 'd' })).toEqual({
      totalAttempts: 0,
      passedAttempts: 0,
      accuracy: 0,
    });
  });
});
