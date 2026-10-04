import { enUS, zhTW } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import type { Locale } from '@/i18n/config';

/** Change 33: UI 語言 → date-fns locale（相對時間用）。 */
export function dateFnsLocale(locale: Locale): DateFnsLocale {
  return locale === 'zh-TW' ? zhTW : enUS;
}
