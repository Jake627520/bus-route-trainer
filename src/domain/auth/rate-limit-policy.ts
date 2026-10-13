/**
 * Change 49: 認證端點限流規則（純資料，零相依）。
 * 數字經人審核准；司機常共用站場 Wi‑Fi／電信業者共用 IP，所以「每 IP」上限刻意放寬。
 * 改動前請同步 openspec/specs/driver-auth 與 rate-limit-policy.test.ts。
 */
export interface RateRule {
  /** 儲存 key 的一部分，必須唯一。 */
  readonly name: string;
  /** 一個時間窗內允許的次數。 */
  readonly limit: number;
  readonly windowMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const RATE_RULES = {
  /** 登入：同一 IP 的所有嘗試。 */
  loginIp: { name: 'login-ip', limit: 30, windowMs: 15 * MIN },
  /** 登入：同一帳號的「失敗」次數（成功即清除）。 */
  loginFailUser: { name: 'login-fail-user', limit: 5, windowMs: 15 * MIN },
  registerIp: { name: 'register-ip', limit: 10, windowMs: HOUR },
  forgotIp: { name: 'forgot-ip', limit: 10, windowMs: HOUR },
  forgotEmail: { name: 'forgot-email', limit: 3, windowMs: HOUR },
  resetIp: { name: 'reset-ip', limit: 20, windowMs: HOUR },
} as const satisfies Record<string, RateRule>;

/** 過期列保留多久（之後可被清掉）。 */
export const RATE_RETENTION_MS = 24 * HOUR;
