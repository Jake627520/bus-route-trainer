/** Change 52: 提醒設定（集中一處，日後好調）。 */

/** 每個批次平行發送的訂閱數。 */
export const SEND_BATCH_SIZE = 20;
/** 單次 cron 最多處理的訂閱數（Vercel 函式有時間限制；沒處理到的「今天未發」下次自然續跑）。 */
export const MAX_SUBSCRIPTIONS_PER_RUN = 500;
/** 每位司機最多可有幾台裝置的訂閱。 */
export const MAX_SUBSCRIPTIONS_PER_DRIVER = 10;
