import type { TFunction } from '@/i18n/t';

/**
 * 螢幕閱讀器用的提示念法。
 * - `C________`（首字母提示）→ 「C, 9 letters」，不能念成黏在一起的 "Cblank"。
 * - 其餘連續底線 → 「blank」，前後留空白。
 */
export function spokenHint(hint: string, t: TFunction): string {
  return hint
    .replace(/(\p{L})(_+)/gu, (_m, letter: string, rest: string) =>
      ` ${t('recall.spokenInitial', { letter, count: rest.length + 1 })} `,
    )
    .replace(/_{2,}/g, ` ${t('recall.blankSpoken')} `)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,，])/g, '$1')
    .trim();
}
