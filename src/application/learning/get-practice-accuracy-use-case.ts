import { PracticeStatsQueryPort } from '@/application/learning/practice-stats-query-port';

export interface PracticeAccuracy {
  totalAttempts: number;
  passedAttempts: number;
  /** passed / total（0–1）；無 attempt 時為 0。 */
  accuracy: number;
}

export interface GetPracticeAccuracyCommand {
  driverId: string;
}

/**
 * Change 20: 整體練習正確率。
 */
export class GetPracticeAccuracyUseCase {
  constructor(private readonly statsPort: PracticeStatsQueryPort) {}

  async execute(command: GetPracticeAccuracyCommand): Promise<PracticeAccuracy> {
    const { total, passed } = await this.statsPort.countOutcomesByDriver(command.driverId);
    return {
      totalAttempts: total,
      passedAttempts: passed,
      accuracy: total > 0 ? passed / total : 0,
    };
  }
}
