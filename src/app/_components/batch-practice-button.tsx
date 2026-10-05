'use client';

import { useEffect, useState } from 'react';
import { apiClient, type VariantReviewSummary } from '@/app/_lib/api-client';
import { encodeQueue } from '@/app/_lib/practice-queue';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 18 / 31: 「練習全部到期」入口（i18n）。
 */
export function BatchPracticeButton() {
  const t = useT();
  const [items, setItems] = useState<VariantReviewSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getReviewSummary()
      .then((s) => {
        if (active) setItems(s);
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, []);

  if (items === null) return null;

  const due = items.filter((i) => i.dueCount > 0);
  if (due.length === 0) return null;

  const href = `/practice/recall?queue=${encodeQueue(
    due.map((i) => ({ routeId: i.routeId, variantKey: i.variantKey }))
  )}`;

  return (
    <a
      href={href}
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-pink-700 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-800 hover:shadow active:translate-y-px dark:bg-pink-600 dark:hover:bg-pink-700"
    >
      {t('batchPractice.button', { count: due.length })}
    </a>
  );
}
