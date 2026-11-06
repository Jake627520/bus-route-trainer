import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { renderZh } from '@/__tests__/helpers/render';
import { PushReminderToggle } from '@/app/_components/push-reminder-toggle';

const PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

let current: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null;
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() };
const fetchMock = vi.fn();

const makeSub = (endpoint = 'https://push.example/dev') => ({
  endpoint,
  toJSON: () => ({ endpoint, keys: { p256dh: 'P', auth: 'A' } }),
  unsubscribe: vi.fn(async () => true),
});
const ok = () => ({ ok: true, status: 200, json: async () => ({ data: { ok: true } }) }) as Response;

function install(opts: { permission?: NotificationPermission; request?: NotificationPermission; ua?: string; standalone?: boolean; sw?: boolean; push?: boolean } = {}) {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', PUBLIC_KEY);
  class N { static permission = opts.permission ?? 'default'; static requestPermission = vi.fn(async () => opts.request ?? 'granted'); }
  vi.stubGlobal('Notification', N);
  if (opts.push !== false) vi.stubGlobal('PushManager', class {});
  else vi.stubGlobal('PushManager', undefined);
  if (opts.sw !== false) {
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
  } else {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
  Object.defineProperty(navigator, 'userAgent', { value: opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/120', configurable: true });
  Object.defineProperty(navigator, 'standalone', { value: opts.standalone, configurable: true });
  return N;
}

describe('Change 52: PushReminderToggle', () => {
  beforeEach(() => {
    current = null;
    pushManager.getSubscription.mockImplementation(async () => current);
    pushManager.subscribe.mockImplementation(async () => { current = makeSub(); return current; });
    fetchMock.mockReset().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('renders nothing when this deployment has no push key', async () => {
    install();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    const { container } = renderZh(<PushReminderToggle />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the browser has no push support', async () => {
    install({ push: false });
    const { container } = renderZh(<PushReminderToggle />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('tells iPhone users in a Safari tab to add the site to the Home Screen first (no button)', async () => {
    install({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', standalone: false });
    renderZh(<PushReminderToggle />);
    expect(await screen.findByText(/加到主畫面/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the toggle on iPhone once installed to the Home Screen', async () => {
    install({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', standalone: true });
    renderZh(<PushReminderToggle />);
    expect(await screen.findByRole('button', { name: '開啟' })).toBeInTheDocument();
  });

  it('turning on: asks permission, subscribes, and tells the server (with the page language)', async () => {
    const N = install();
    renderZh(<PushReminderToggle />);
    fireEvent.click(await screen.findByRole('button', { name: '開啟' }));
    expect(await screen.findByRole('button', { name: '關閉' })).toBeInTheDocument();
    expect(N.requestPermission).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/push/subscribe');
    expect(JSON.parse(init.body)).toEqual({ endpoint: 'https://push.example/dev', keys: { p256dh: 'P', auth: 'A' }, locale: 'zh-TW' });
    expect(screen.getByRole('status')).toHaveTextContent('已開啟');
  });

  it('shows "on" at load if this device is already subscribed', async () => {
    install({ permission: 'granted' });
    current = makeSub();
    renderZh(<PushReminderToggle />);
    expect(await screen.findByRole('button', { name: '關閉' })).toBeInTheDocument();
  });

  it('turning off: tells the server first, then unsubscribes the browser', async () => {
    install({ permission: 'granted' });
    current = makeSub();
    const sub = current;
    renderZh(<PushReminderToggle />);
    fireEvent.click(await screen.findByRole('button', { name: '關閉' }));
    expect(await screen.findByRole('button', { name: '開啟' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/push/unsubscribe');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ endpoint: 'https://push.example/dev' });
    expect(sub!.unsubscribe).toHaveBeenCalled();
  });

  it('if the server refuses to unsubscribe, it stays on and shows an error', async () => {
    install({ permission: 'granted' });
    current = makeSub();
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'x' } }) } as Response);
    renderZh(<PushReminderToggle />);
    fireEvent.click(await screen.findByRole('button', { name: '關閉' }));
    expect(await screen.findByText(/設定失敗/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '關閉' })).toBeInTheDocument();
    expect(current!.unsubscribe).not.toHaveBeenCalled();
  });

  it('permission denied: explains how to allow it and stays off', async () => {
    install({ request: 'denied' });
    renderZh(<PushReminderToggle />);
    fireEvent.click(await screen.findByRole('button', { name: '開啟' }));
    expect(await screen.findByText(/通知已被封鎖/)).toBeInTheDocument();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('already blocked at load: shows the explanation instead of a button', async () => {
    install({ permission: 'denied' });
    renderZh(<PushReminderToggle />);
    expect(await screen.findByText(/通知已被封鎖/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('if the server refuses the subscription, the browser subscription is rolled back', async () => {
    install();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'TOO_MANY_SUBSCRIPTIONS', message: 'x' } }) } as Response);
    renderZh(<PushReminderToggle />);
    fireEvent.click(await screen.findByRole('button', { name: '開啟' }));
    expect(await screen.findByText(/設定失敗/)).toBeInTheDocument();
    await waitFor(() => expect(current!.unsubscribe).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '開啟' })).toBeInTheDocument();
  });

  it('English copy', async () => {
    install();
    renderZh(<PushReminderToggle />, 'en');
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(screen.getByText('Daily review reminder')).toBeInTheDocument();
  });
});
