'use client';

import type { MessageKey } from './messages';
import { useT } from './locale-provider';

/** 讓 server component 也能顯示翻譯字串。 */
export function Text({ k, params }: { k: MessageKey; params?: Record<string, string | number> }) {
  const { t } = useT();
  return <>{t(k, params)}</>;
}
