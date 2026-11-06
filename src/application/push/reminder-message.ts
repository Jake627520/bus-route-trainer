import type { Locale } from '@/i18n/config';

/**
 * Change 52: 推播內容樣板。
 * 通知會顯示在鎖定畫面，所以只放固定文字與張數——絕不含站名、路線、題目或答案。
 * 這裡不用 client 端的 i18n（那需要 React context），語言由訂閱時存下的 locale 決定。
 */
export const REMINDER_URL = '/';

export function buildReminderPayload(locale: Locale, dueCount: number): string {
  const payload =
    locale === 'zh-TW'
      ? { title: '待複習提醒', body: `你有 ${dueCount} 張卡片待複習`, url: REMINDER_URL }
      : {
          title: 'Review reminder',
          body: `You have ${dueCount} ${dueCount === 1 ? 'card' : 'cards'} to review`,
          url: REMINDER_URL,
        };
  return JSON.stringify(payload);
}
