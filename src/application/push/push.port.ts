import type { Locale } from '@/i18n/config';

/** Change 52: 一台裝置的推播訂閱（瀏覽器給的「地址＋鑰匙」）。 */
export interface PushSubscriptionRecord {
  readonly id: string;
  readonly driverId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly locale: Locale;
  /** 最後一次「處理過」（發送或判定不需發送）的 Brisbane 日（YYYY-MM-DD）；null = 從未發過。 */
  readonly lastCheckedDay: string | null;
}

export interface NewPushSubscription {
  readonly driverId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly locale: Locale;
}

export interface PushSubscriptionRepository {
  /** 以 endpoint 為準新增或更新；同 endpoint 換帳號時轉移給新帳號。 */
  upsert(subscription: NewPushSubscription): Promise<void>;
  countByDriver(driverId: string): Promise<number>;
  existsForDriver(driverId: string, endpoint: string): Promise<boolean>;
  /** 只刪屬於該司機的訂閱（防止刪別人的）。 */
  deleteByEndpoint(driverId: string, endpoint: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  /** 今天（day）尚未處理的訂閱，最多 limit 筆。 */
  findNotCheckedOn(day: string, limit: number): Promise<PushSubscriptionRecord[]>;
  markChecked(id: string, day: string): Promise<void>;
}

/** 提醒所需的學習資料查詢（只算數字，不載入站名或題目）。 */
export interface ReminderStatsQuery {
  /** 該司機所有已報名路線中，到期（nextReviewAt <= now）的卡片數。 */
  countDueCards(driverId: string, now: Date): Promise<number>;
  /** 該司機自 since 起是否有作答紀錄。 */
  hasAttemptSince(driverId: string, since: Date): Promise<boolean>;
}

export type PushSendResult = 'ok' | 'gone' | 'error';

export interface PushSender {
  send(
    target: { endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<PushSendResult>;
}
