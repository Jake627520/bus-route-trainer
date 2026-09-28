'use client';

import { useEffect, useState } from 'react';
import { apiClient, type PracticeAccuracy } from '@/app/_lib/api-client';

/**
 * Change 20: 整體練習正確率 stat 卡（client component）。
 * 有練習紀錄 → 顯示正確率% 與答對/總題；無紀錄 → 友善提示；載入中/錯誤 → 靜默。
 */
export function AccuracyStat({ variantKey }: { variantKey?: string } = {}) {
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
    if (compact) return <p className="text-xs text-zinc-400">正確率：尚無紀錄</p>;
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
        還沒有練習紀錄，先去練幾題吧。
      </p>
    );
  }

  const pct = Math.round(data.accuracy * 100);

  if (compact) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        正確率 {pct}%（{data.passedAttempts}/{data.totalAttempts}）
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">正確率 {pct}%</p>
      <p className="mt-1 text-sm text-zinc-500">
        {data.passedAttempts} / {data.totalAttempts} 題答對
      </p>
    </div>
  );
}
