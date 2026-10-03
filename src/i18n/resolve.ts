import { DEFAULT_LOCALE, Locale, isLocale } from './config';

/**
 * Change 30: 解析語言。
 * 優先序：有效的 cookie 明確選擇 > Accept-Language（zh* → zh-TW，其餘 → en）> DEFAULT_LOCALE。
 */
export function resolveLocale(
  acceptLanguage: string | null | undefined,
  cookieLocale: string | null | undefined
): Locale {
  if (isLocale(cookieLocale)) return cookieLocale;

  const header = (acceptLanguage ?? '').trim().toLowerCase();
  if (header.length === 0) return DEFAULT_LOCALE;

  // 取第一個偏好語言標籤（忽略 q 權重，依序第一個即最高優先）。
  const first = header.split(',')[0]?.split(';')[0]?.trim() ?? '';
  if (first.startsWith('zh')) return 'zh-TW';
  return DEFAULT_LOCALE;
}
