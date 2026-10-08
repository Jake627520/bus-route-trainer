/**
 * Change 42: 密碼強度政策（純 domain，零相依，前後端共用）。
 *
 * 硬性規則：
 * - 至少 8 字元（建議 12 字元以上）
 * - 至少 1 個小寫字母、1 個大寫字母、1 個特殊符號
 * - 數字為選填
 *
 * 另依 NIST SP 800-63B 建議擋下常見弱密碼（字典比對），
 * 避免 `Password!1` 這類「字元組成合規但實際極弱」的密碼。
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RECOMMENDED_LENGTH = 12;

/** 允許的特殊符號集合（與前端說明文字一致）。 */
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

export const PASSWORD_RULE_CODES = [
  'MIN_LENGTH',
  'LOWERCASE',
  'UPPERCASE',
  'SPECIAL',
  'COMMON',
] as const;

export type PasswordRuleCode = (typeof PASSWORD_RULE_CODES)[number];

export interface PasswordValidationResult {
  readonly valid: boolean;
  /** 未通過的規則；valid 為 true 時為空陣列。 */
  readonly failed: readonly PasswordRuleCode[];
}

const LOWERCASE_RE = /[a-z]/;
const UPPERCASE_RE = /[A-Z]/;
// 對應 PASSWORD_SPECIAL_CHARS，於字元集合中逐字轉義。
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

/**
 * 常見弱密碼字典（小寫比對）。刻意保持精簡：
 * 真正的字典防護應在上線後接外部清單（如 HIBP k-anonymity API），
 * 這裡先擋掉最常被自動化工具嘗試的組合。
 */
const COMMON_PASSWORDS = new Set([
  'password!1',
  'password@1',
  'password1!',
  'passw0rd!',
  'passw0rd@',
  'admin@123',
  'admin!123',
  'admin@1234',
  'welcome@1',
  'welcome@123',
  'qwerty@123',
  'qwerty!123',
  'letmein@1',
  'letmein@123',
  'abcd@1234',
  'test@1234',
  'changeme@1',
  'iloveyou@1',
]);

/**
 * 驗證密碼是否符合政策。回傳所有未通過的規則，讓呼叫端一次顯示完整提示。
 * 非字串輸入視為完全不合規，不丟例外。
 */
export function validatePassword(password: string): PasswordValidationResult {
  const value = typeof password === 'string' ? password : '';
  const failed: PasswordRuleCode[] = [];

  if (value.length < PASSWORD_MIN_LENGTH) failed.push('MIN_LENGTH');
  if (!LOWERCASE_RE.test(value)) failed.push('LOWERCASE');
  if (!UPPERCASE_RE.test(value)) failed.push('UPPERCASE');
  if (!SPECIAL_RE.test(value)) failed.push('SPECIAL');
  if (COMMON_PASSWORDS.has(value.toLowerCase())) failed.push('COMMON');

  return { valid: failed.length === 0, failed };
}

/** 給 API 錯誤訊息用的單行摘要（英文，前端另有 i18n 說明）。 */
export function describePasswordPolicy(): string {
  return `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include a lowercase letter, an uppercase letter and a special character (${PASSWORD_SPECIAL_CHARS}).`;
}
