'use client';

import { useEffect } from 'react';

/**
 * Change 51: 註冊 service worker。
 * - 只在 production 註冊：開發時的快取很容易造成「改了程式卻看不到」的困擾。
 * - 等頁面 load 完成才註冊，不與首次繪製搶資源。
 * - 失敗一律靜默：沒有 service worker 網站照常運作，只是少了離線頁。
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          /* 靜默 */
        });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
