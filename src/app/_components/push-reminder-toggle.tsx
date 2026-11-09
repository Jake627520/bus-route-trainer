'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/app/_components/locale-provider';
import {
  detectPushSupport,
  isThisDeviceSubscribed,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '@/app/_lib/push-client';

type View = 'loading' | 'hidden' | 'ios-install' | 'denied' | 'off' | 'on';

/**
 * Change 52: 每日複習提醒開關（client）。
 * 每台裝置各自開關；不自動要權限，使用者按「開啟」才會跳出瀏覽器詢問。
 * 不支援（或這個部署沒設推播金鑰）→ 不顯示；iPhone 瀏覽器分頁 → 提示先加到主畫面。
 */
export function PushReminderToggle() {
  const t = useT();
  const locale = useLocale();
  const [view, setView] = useState<View>('loading');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const support = detectPushSupport();
      if (support === 'unsupported') return active && setView('hidden');
      if (support === 'ios-install') return active && setView('ios-install');
      const subscribed = await isThisDeviceSubscribed();
      if (!active) return;
      if (subscribed) return setView('on');
      setView(Notification.permission === 'denied' ? 'denied' : 'off');
    })().catch(() => {
      if (active) setView('hidden');
    });
    return () => {
      active = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setFailed(false);
    const outcome = await subscribeThisDevice(locale);
    setBusy(false);
    if (outcome === 'on') setView('on');
    else if (outcome === 'denied') setView('denied');
    else if (outcome === 'error') setFailed(true);
  };

  const turnOff = async () => {
    setBusy(true);
    setFailed(false);
    const done = await unsubscribeThisDevice();
    setBusy(false);
    if (done) setView('off');
    else setFailed(true);
  };

  if (view === 'loading' || view === 'hidden') return null;

  return (
    <section
      aria-labelledby="push-reminder-title"
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <h2 id="push-reminder-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {t('push.title')}
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t('push.description')}</p>

      {view === 'ios-install' && (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{t('push.iosInstall')}</p>
      )}
      {view === 'denied' && (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{t('push.denied')}</p>
      )}

      {(view === 'off' || view === 'on') && (
        <button
          type="button"
          onClick={view === 'on' ? turnOff : turnOn}
          disabled={busy}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {busy ? t('push.working') : view === 'on' ? t('push.disable') : t('push.enable')}
        </button>
      )}

      {/* 常駐播報區：狀態改變時螢幕閱讀器會念出來。 */}
      <p role="status" className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {failed ? t('push.error') : view === 'on' ? t('push.on') : ''}
      </p>
    </section>
  );
}
