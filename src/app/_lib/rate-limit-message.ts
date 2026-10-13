import type { TFunction } from '@/i18n/t';

/** Change 49: 伺服器給的剩餘秒數 → 要請使用者等幾分鐘（無條件進位，至少 1）。 */
export function rateLimitedMinutes(retryAfterSeconds: number | undefined): number {
  return Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60));
}

/** 伺服器錯誤是否為限流。 */
export function isRateLimited(err: { code?: string } | undefined): boolean {
  return err?.code === 'RATE_LIMITED';
}

/** 在地化的「嘗試次數過多」訊息（不顯示伺服器的英文原文）。 */
export function rateLimitedMessage(err: { retryAfterSeconds?: number } | undefined, t: TFunction): string {
  const minutes = rateLimitedMinutes(err?.retryAfterSeconds);
  return t(minutes === 1 ? 'rateLimit.tooManyOne' : 'rateLimit.tooMany', { minutes });
}
