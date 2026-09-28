'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/app/_lib/api-client';

type PermState = NotificationPermission | 'unsupported';

function readPermission(): PermState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Change 23: 前景 Web Notification 複習提醒（client component）。
 * - default：顯示「開啟複習提醒」按鈕 → 請求權限。
 * - granted：不顯示 UI；掛載時抓 review summary，到期總數>0 發一則系統通知（ref 防重入）。
 * - denied / 不支援：不顯示、不動作。
 */
export function ReviewNotifier() {
  const [perm, setPerm] = useState<PermState>('unsupported');
  const notified = useRef(false);

  useEffect(() => {
    setPerm(readPermission());
  }, []);

  useEffect(() => {
    if (perm !== 'granted' || notified.current) return;
    let active = true;
    apiClient
      .getReviewSummary()
      .then((items) => {
        if (!active || notified.current) return;
        const totalDue = items.reduce((sum, i) => sum + i.dueCount, 0);
        if (totalDue > 0) {
          notified.current = true;
          new Notification('待複習提醒', { body: `你有 ${totalDue} 張卡片待複習` });
        }
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, [perm]);

  const enable = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result);
  };

  if (perm !== 'default') return null; // unsupported / granted / denied → 無按鈕

  return (
    <button
      type="button"
      onClick={enable}
      className="inline-flex min-h-[40px] items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      開啟複習提醒
    </button>
  );
}
