import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

function matchTag(tag: string): Locale | null {
  const lower = tag.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-TW';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

/** 語言決定順序：有效 cookie → Accept-Language（依 q 值）→ 後備 en。 */
export function resolveLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;

  const ranked = (input.acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((x) => x.tag && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { tag } of ranked) {
    const hit = matchTag(tag);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}
