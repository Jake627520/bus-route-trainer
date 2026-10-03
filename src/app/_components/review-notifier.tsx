'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { apiClient } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

type PermState = NotificationPermission | 'unsupported';

const isSupported = () => typeof window !== 'undefined' && 'Notification' in window;
const noopSubscribe = () => () => {};
const clientSnapshot = (): PermState => (isSupported() ? Notification.permission : 'unsupported');
const serverSnapshot = (): PermState => 'unsupported';

/**
 * Change 23: 前景 Web Notification 複習提醒（client component）。
 * - default：顯示「開啟複習提醒」按鈕 → 請求權限。
 * - granted：不顯示 UI；掛載時抓 review summary，到期總數>0 發一則系統通知（ref 防重入）。
 * - denied / 不支援：不顯示、不動作。
 *
 * 以 useSyncExternalStore 讀取權限（SSR 安全，避免 effect 內 setState）；
 * 請求權限後以 override 反映新狀態。
 */
export function ReviewNotifier() {
  const t = useT();
  const externalPerm = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  const [override, setOverride] = useState<PermState | null>(null);
  const perm = override ?? externalPerm;
  const notified = useRef(false);

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
          new Notification(t('reviewNotifier.notifTitle'), { body: t('reviewNotifier.notifBody', { count: totalDue }) });
        }
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, [perm, t]);

  const enable = async () => {
    if (!isSupported()) return;
    const result = await Notification.requestPermission();
    setOverride(result);
  };

  if (perm !== 'default') return null;

  return (
    <button
      type="button"
      onClick={enable}
      className="inline-flex min-h-[40px] items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {t('reviewNotifier.enableButton')}
    </button>
  );
}
