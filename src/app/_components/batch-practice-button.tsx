'use client';

import { useEffect, useState } from 'react';
import { apiClient, type VariantReviewSummary } from '@/app/_lib/api-client';
import { encodeQueue } from '@/app/_lib/practice-queue';

/**
 * Change 18: 「練習全部到期」入口。
 * 由 review summary 取 dueCount>0 的 variant（已依 dueCount 排序）組成佇列，
 * 導向 /practice/recall?queue=..。無到期不顯示；載入中/錯誤靜默。
 */
export function BatchPracticeButton() {
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
      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
    >
      練習全部到期（{due.length} 條路線）
    </a>
  );
}
