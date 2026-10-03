import type { Locale } from './config';
import { messages, type MessageKey } from './messages';

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

/** 取翻譯；缺 key 回 key 本身；`{name}` 以 params 插值。 */
export function createT(locale: Locale): TFunction {
  const dict = messages[locale];
  return (key, params) => {
    const template = dict[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in params ? String(params[name]) : m,
    );
  };
}
