'use client';

import { useEffect, useState } from 'react';
import { apiClient, type VariantReviewSummary } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 16 / 31: 首頁待複習提醒橫幅（client component，i18n）。
 */
export function ReviewReminder() {
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
        /* 靜默：載入失敗不顯示提醒 */
      });
    return () => {
      active = false;
    };
  }, []);

  // 載入中 / 錯誤 / 無 enrolled → 不顯示
  if (items === null || items.length === 0) return null;

  const totalDue = items.reduce((sum, i) => sum + i.dueCount, 0);

  if (totalDue === 0) {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        {t('reviewReminder.allDone')}
      </div>
    );
  }

  // summary 已依 dueCount 由多到少排序 → items[0] 為最該複習
  const top = items[0];
  const href = `/practice/recall?${new URLSearchParams({ routeId: top.routeId, variantKey: top.variantKey }).toString()}`;

  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40 sm:flex-row sm:items-center">
      <p className="font-medium text-amber-900 dark:text-amber-100">
        {t('reviewReminder.due', { count: totalDue })}
      </p>
      <a
        href={href}
        className="inline-flex min-h-[40px] shrink-0 items-center rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
      >
        {t('reviewReminder.start')}
      </a>
    </div>
  );
}
