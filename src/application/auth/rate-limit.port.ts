/** Change 49: 限流計數的儲存介面（固定時間窗）。 */
export interface RateLimitRepository {
  /** 該時間窗的計數 +1（必須原子），回傳遞增後的值。 */
  increment(key: string, windowStart: Date): Promise<number>;
  /** 讀目前計數（沒有則 0）。 */
  count(key: string, windowStart: Date): Promise<number>;
  /** 清掉某個 key 的所有時間窗。 */
  clear(key: string): Promise<void>;
  /** 刪除時間窗早於 date 的過期列。 */
  deleteOlderThan(date: Date): Promise<void>;
}
