'use client';

import { useEffect, useState } from 'react';
import { apiClient, type PracticeAccuracy } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 20 / 31: 整體練習正確率 stat 卡（client component，i18n）。
 */
export function AccuracyStat({ variantKey }: { variantKey?: string } = {}) {
  const t = useT();
  const [data, setData] = useState<PracticeAccuracy | null>(null);
  const compact = variantKey !== undefined;

  useEffect(() => {
    let active = true;
    apiClient
      .getPracticeAccuracy(variantKey)
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, [variantKey]);

  if (data === null) return null;

  if (data.totalAttempts === 0) {
    if (compact) return <p className="text-xs text-zinc-400">{t('accuracyStat.compactEmpty')}</p>;
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
        {t('accuracyStat.empty')}
      </p>
    );
  }

  const pct = Math.round(data.accuracy * 100);

  if (compact) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {t('accuracyStat.compact', { pct, passed: data.passedAttempts, total: data.totalAttempts })}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t('accuracyStat.title', { pct })}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {t('accuracyStat.detail', { passed: data.passedAttempts, total: data.totalAttempts })}
      </p>
    </div>
  );
}
