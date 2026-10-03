import { DEFAULT_LOCALE, Locale } from './config';
import { messages } from './messages';

export type TVars = Record<string, string | number>;
export type TFunction = (key: string, vars?: TVars) => string;

function lookup(locale: Locale, key: string): string | undefined {
  let node: unknown = messages[locale];
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  );
}

/**
 * Change 30: 建立翻譯函式。
 * 查找順序：指定 locale > en 後備 > key 字串本身（避免整頁崩）。支援 {var} 內插。
 */
export function createT(locale: Locale): TFunction {
  return (key, vars) => {
    const raw = lookup(locale, key) ?? lookup(DEFAULT_LOCALE, key) ?? key;
    return interpolate(raw, vars);
  };
}
