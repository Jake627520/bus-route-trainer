'use client';

import { useEffect, useState } from 'react';
import { apiClient, type PracticeStreak } from '@/app/_lib/api-client';

/**
 * Change 22: 練習連續天數 stat（client component）。
 * 有練習紀錄 → 顯示連續天數與最佳；無紀錄 → 友善提示；載入中/錯誤 → 靜默。
 */
export function StreakStat() {
  const [data, setData] = useState<PracticeStreak | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getPracticeStreak()
      .then((d) => {
        if (active) setData(d);
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, []);

  if (data === null) return null;

  if (data.longestStreak === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
        開始每天練習，累積連續天數。
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        🔥 連續練習 {data.currentStreak} 天
      </p>
      <p className="mt-1 text-sm text-zinc-500">最佳 {data.longestStreak} 天</p>
    </div>
  );
}
