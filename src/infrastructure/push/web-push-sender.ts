import webpush from 'web-push';
import type { PushSendResult, PushSender } from '@/application/push/push.port';
import type { PushConfig } from './push-config';

/** 推播服務保留訊息的時間：12 小時（過了才送到的提醒沒意義）。 */
const TTL_SECONDS = 12 * 60 * 60;

/** Change 52: 用 `web-push` 套件送出（加密與 VAPID 簽章都由它處理）。 */
export class WebPushSender implements PushSender {
  constructor(private readonly config: PushConfig) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  }

  async send(
    target: { endpoint: string; p256dh: string; auth: string },
    payload: string,
  ): Promise<PushSendResult> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { TTL: TTL_SECONDS, urgency: 'normal' },
      );
      return 'ok';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 404／410：訂閱已失效（使用者撤銷或裝置不再有效）→ 呼叫端刪除。
      return status === 404 || status === 410 ? 'gone' : 'error';
    }
  }
}
