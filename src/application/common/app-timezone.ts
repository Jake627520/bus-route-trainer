/**
 * Change 33: 應用時區。真實用戶是昆士蘭（Brisbane）公車司機，
 * 且 GTFS agency 時區即 Australia/Brisbane（UTC+10、無夏令時）。
 * 所有「以日為單位」的計算（streak、趨勢、attempt 日期分組）一律以此時區決定日界，
 * 否則清晨練習會被 UTC 算到前一天。
 */
export const APP_TIME_ZONE = 'Australia/Brisbane';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 把時間點轉成應用時區（Brisbane）的日期字串 YYYY-MM-DD。 */
export function toAppDateString(date: Date): string {
  const parts = dateFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
