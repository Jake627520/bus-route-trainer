import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AuthStatus } from '@/app/_components/auth-status';
import { ReviewNotifier } from '@/app/_components/review-notifier';
import { apiClient } from '@/app/_lib/api-client';
import { LocaleProvider } from '@/app/_components/locale-provider';

const routerPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

const wrap = (ui: React.ReactElement) => render(<LocaleProvider locale="zh-TW">{ui}</LocaleProvider>);

describe('Change 52: logout removes this device\'s push subscription', () => {
  const sub = { endpoint: 'https://push.example/dev', unsubscribe: vi.fn(async () => true) };
  const pushManager = { getSubscription: vi.fn() };

  beforeEach(() => {
    routerPush.mockClear();
    sub.unsubscribe.mockClear();
    pushManager.getSubscription.mockReset().mockResolvedValue(sub);
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager }) }, configurable: true });
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({ id: 'd1', username: 'alice' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('tells the server to drop the device BEFORE the session is cleared, then logs out', async () => {
    const order: string[] = [];
    vi.spyOn(apiClient, 'unsubscribePush').mockImplementation(async () => { order.push('unsubscribe'); });
    vi.spyOn(apiClient, 'logout').mockImplementation(async () => { order.push('logout'); });
    wrap(<AuthStatus />);
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/login'));
    expect(order).toEqual(['unsubscribe', 'logout']);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('still logs out when the unsubscribe fails', async () => {
    vi.spyOn(apiClient, 'unsubscribePush').mockRejectedValue(new Error('offline'));
    const logout = vi.spyOn(apiClient, 'logout').mockResolvedValue();
    wrap(<AuthStatus />);
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(routerPush).toHaveBeenCalledWith('/login');
  });

  it('does not wait forever on a stuck service worker', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: new Promise(() => {}) }, configurable: true });
    const logout = vi.spyOn(apiClient, 'logout').mockResolvedValue();
    wrap(<AuthStatus />);
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => expect(logout).toHaveBeenCalled(), { timeout: 9000 });
  }, 12000);

  it('works on browsers without service workers at all', async () => {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    const logout = vi.spyOn(apiClient, 'logout').mockResolvedValue();
    wrap(<AuthStatus />);
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });
});

describe('Change 52: one reminder button, not two', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const stub = () => {
    class N { static permission = 'default'; static requestPermission = vi.fn(); }
    vi.stubGlobal('Notification', N);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) }));
  };

  it('keeps the old foreground-reminder button where push is not configured', async () => {
    stub();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    wrap(<ReviewNotifier />);
    expect(await screen.findByRole('button', { name: /開啟複習提醒/ })).toBeInTheDocument();
  });

  it('hides it where the daily push reminder is available (the toggle handles permission)', async () => {
    stub();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'KEY');
    const { container } = wrap(<ReviewNotifier />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
