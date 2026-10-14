'use client';

import { useEffect, useState } from 'react';
import { useT } from './locale-provider';

/**
 * Change 51: 斷線時顯示提示。
 * 常駐的 role="status" 區域（線上時是空的），內容變動時螢幕閱讀器才會念出來。
 * 初始值假設「在線」，掛載後才讀 navigator.onLine，避免伺服器／客戶端 HTML 不一致。
 */
export function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return (
    <div role="status">
      {offline && (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 dark:bg-amber-900 dark:text-amber-50">
          {t('offline.banner')}
        </p>
      )}
    </div>
  );
}
