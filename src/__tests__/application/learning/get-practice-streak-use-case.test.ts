import { describe, it, expect } from 'vitest';
import { GetPracticeStreakUseCase } from '@/application/learning/get-practice-streak-use-case';
import { PracticeStatsQueryPort } from '@/application/learning/practice-stats-query-port';
import { Clock } from '@/application/common/clock';

/**
 * Change 22 Task 3: GetPracticeStreakUseCase（純邏輯、固定 clock）。
 */
describe('Change 22: GetPracticeStreakUseCase', () => {
  const clockAt = (iso: string): Clock => ({ now: () => new Date(iso) });
  const port = (dates: string[]): PracticeStatsQueryPort => ({
    countOutcomesByDriver: async () => ({ total: 0, passed: 0 }),
    findAttemptDates: async () => dates,
  });
  const run = (dates: string[], todayIso: string) =>
    new GetPracticeStreakUseCase(port(dates), clockAt(todayIso)).execute({ driverId: 'd' });

  it('counts consecutive days ending today', async () => {
    expect(await run(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10T12:00:00.000Z')).toEqual({
      currentStreak: 3, longestStreak: 3, lastPracticedOn: '2026-03-10',
    });
  });

  it('stays active when the last practice was yesterday', async () => {
    const r = await run(['2026-03-08', '2026-03-09'], '2026-03-10T12:00:00.000Z');
    expect(r.currentStreak).toBe(2);
  });

  it('resets current streak to 0 when the last practice is older than yesterday', async () => {
    const r = await run(['2026-03-05', '2026-03-06'], '2026-03-10T12:00:00.000Z');
    expect(r).toEqual({ currentStreak: 0, longestStreak: 2, lastPracticedOn: '2026-03-06' });
  });

  it('computes longest streak across gaps', async () => {
    const r = await run(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-08', '2026-03-09'], '2026-03-09T12:00:00.000Z');
    expect(r).toEqual({ currentStreak: 2, longestStreak: 3, lastPracticedOn: '2026-03-09' });
  });

  it('returns zeros when there is no practice', async () => {
    expect(await run([], '2026-03-10T12:00:00.000Z')).toEqual({
      currentStreak: 0, longestStreak: 0, lastPracticedOn: null,
    });
  });
});
