/**
 * Change 20: 練習結果統計查詢（由 recall attempt 日誌）。
 */
export interface OutcomeCounts {
  total: number;
  passed: number;
}

export interface PracticeStatsQueryPort {
  /** 統計某 driver 的 attempt 總數與 PASS 數；帶 variantKey 時只計該 variant。 */
  countOutcomesByDriver(driverId: string, variantKey?: string): Promise<OutcomeCounts>;

  /** 該 driver 有練習的 UTC 日期（YYYY-MM-DD），去重、升冪。 */
  findAttemptDates(driverId: string): Promise<string[]>;
}
