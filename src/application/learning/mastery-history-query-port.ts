import { CardState } from '@/domain/learning/learning-card';

/**
 * Change 17: 由 recall attempt 日誌取得某 driver 的「精熟事件」，供趨勢重放。
 * 每筆 = 某次結算後該卡的狀態快照（resultingState）與時間（answeredAt）。
 */
export interface MasteryEvent {
  cardKey: string;
  resultingState: CardState;
  answeredAt: Date;
}

export interface MasteryHistoryQueryPort {
  /** 依 answeredAt 升冪回傳該 driver 的所有精熟事件。 */
  findMasteryEventsByDriver(driverId: string): Promise<MasteryEvent[]>;
}
