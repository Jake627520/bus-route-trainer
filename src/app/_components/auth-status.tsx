'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, type AuthMe } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 26: 顯示目前登入司機帳號與登出鈕（client component）。
 * 未登入 / 載入中 → 靜默不顯示（頁面保護由 proxy 負責導向）。
 */
export function AuthStatus() {
  const router = useRouter();
  const t = useT();
  const [me, setMe] = useState<AuthMe | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getMe()
      .then((m) => {
        if (active) setMe(m);
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, []);

  if (me === null) return null;

  const onLogout = async () => {
    try {
      await apiClient.logout();
    } catch {
      /* 即使清 cookie 失敗，仍導向登入頁 */
    }
    router.push('/login');
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">
        {t('auth.signedInAs', { name: me.username })}
      </span>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {t('auth.logout')}
      </button>
    </div>
  );
}
