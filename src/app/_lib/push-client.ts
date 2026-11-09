import { apiClient } from '@/app/_lib/api-client';

/**
 * Change 52: 瀏覽器端的推播工具（只在 client 使用）。
 * 公鑰是公開資訊（NEXT_PUBLIC_*，建置時內嵌）；沒設定就視為「這個部署沒開推播」。
 */
export function getVapidPublicKey(): string | null {
  // 必須是字面的 process.env.NEXT_PUBLIC_*，Next 才會在建置時內嵌。
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function isPushConfigured(): boolean {
  return getVapidPublicKey() !== null;
}

export type PushSupport = 'ok' | 'unsupported' | 'ios-install';

/** iPhone／iPad 的 Safari 分頁不支援網頁推播，必須先「加到主畫面」。 */
export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined' || !getVapidPublicKey()) return 'unsupported';
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (isIos) {
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
    if (!standalone) return 'ios-install';
  }
  const w = window as unknown as { PushManager?: unknown; Notification?: unknown };
  if (!('serviceWorker' in navigator) || !w.PushManager || !w.Notification) {
    return 'unsupported';
  }
  return 'ok';
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const READY_TIMEOUT_MS = 5000;

/**
 * 取得 service worker registration。沒有（開發模式不註冊、或還沒註冊完）→ 等最多 5 秒，仍沒有就回 null。
 */
export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
  ]);
}

export async function isThisDeviceSubscribed(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;
  return (await reg.pushManager.getSubscription()) !== null;
}

export type SubscribeOutcome = 'on' | 'denied' | 'dismissed' | 'error';

/** 請求通知權限 → 向瀏覽器訂閱 → 告訴伺服器；伺服器失敗就回滾瀏覽器端訂閱。 */
export async function subscribeThisDevice(locale: string): Promise<SubscribeOutcome> {
  const key = getVapidPublicKey();
  if (!key) return 'error';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'dismissed';

    const reg = await getRegistration();
    if (!reg) return 'error';
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      await subscription.unsubscribe();
      return 'error';
    }
    try {
      await apiClient.subscribePush(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        locale,
      );
    } catch {
      await subscription.unsubscribe().catch(() => {});
      return 'error';
    }
    return 'on';
  } catch {
    return 'error';
  }
}

/** 關閉這台裝置的提醒：先通知伺服器，成功才取消瀏覽器端訂閱。回傳是否成功。 */
export async function unsubscribeThisDevice(): Promise<boolean> {
  try {
    const reg = await getRegistration();
    const subscription = reg ? await reg.pushManager.getSubscription() : null;
    if (!subscription) return true;
    await apiClient.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

/**
 * 登出時 best-effort 取消：共用手機登出後不能繼續收到上一位的提醒。
 * 最多等 3 秒，且永不丟錯，不能擋住登出。
 */
export async function unsubscribeOnLogout(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  await Promise.race([
    unsubscribeThisDevice().catch(() => false),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}
