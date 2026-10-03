/** Change 30: i18n 設定（輕量自建、無依賴）。 */
export const LOCALES = ['en', 'zh-TW'] as const;
export type Locale = (typeof LOCALES)[number];

/** 預設 / 後備語言（真實用戶是 Brisbane 英語司機）。 */
export const DEFAULT_LOCALE: Locale = 'en';

/** 記憶使用者明確選擇的 cookie 名稱。 */
export const LOCALE_COOKIE = 'brt_locale';

/** 判斷字串是否為支援的 Locale。 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
