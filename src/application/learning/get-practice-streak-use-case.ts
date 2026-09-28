import { Clock } from '@/application/common/clock';
import { PracticeStatsQueryPort } from '@/application/learning/practice-stats-query-port';

export interface PracticeStreak {
  currentStreak: number;
  longestStreak: number;
  lastPracticedOn: string | null;
}

export interface GetPracticeStreakCommand {
  driverId: string;
}

const dayIndex = (isoDate: string): number =>
  Math.floor(Date.parse(`${isoDate}T00:00:00.000Z`) / 86_400_000);

/**
 * Change 22: 練習連續天數。
 * currentStreak：從最近練習日往回數的連續天數；最近練習日須為今天或昨天(UTC)才 active，否則 0。
 * longestStreak：日期集合中最長連續天數。
 */
export class GetPracticeStreakUseCase {
  constructor(
    private readonly statsPort: PracticeStatsQueryPort,
    private readonly clock: Clock
  ) {}

  async execute(command: GetPracticeStreakCommand): Promise<PracticeStreak> {
    const dates = await this.statsPort.findAttemptDates(command.driverId);
    if (dates.length === 0) {
      return { currentStreak: 0, longestStreak: 0, lastPracticedOn: null };
    }

    const idx = dates.map(dayIndex); // 已升冪、去重

    // longestStreak
    let longest = 1;
    let run = 1;
    for (let i = 1; i < idx.length; i++) {
      run = idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
      if (run > longest) longest = run;
    }

    // currentStreak：最近練習日為今天或昨天才 active
    const today = dayIndex(this.clock.now().toISOString().slice(0, 10));
    const last = idx[idx.length - 1];
    let current = 0;
    if (last === today || last === today - 1) {
      current = 1;
      for (let i = idx.length - 1; i > 0; i--) {
        if (idx[i] === idx[i - 1] + 1) current++;
        else break;
      }
    }

    return { currentStreak: current, longestStreak: longest, lastPracticedOn: dates[dates.length - 1] };
  }
}
