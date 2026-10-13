import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider } from '@/app/_components/locale-provider';
import LoginPage from '@/app/login/page';
import ForgotPasswordPage from '@/app/forgot/page';
import ResetPasswordPage from '@/app/reset/page';
import { rateLimitedMinutes } from '@/app/_lib/rate-limit-message';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('token=abc'),
}));

const limited = (retryAfterSeconds: number) =>
  ({
    status: 429,
    ok: false,
    json: async () => ({ error: { code: 'RATE_LIMITED', message: 'English server text', retryAfterSeconds } }),
  }) as unknown as Response;

describe('Change 49: rateLimitedMinutes', () => {
  it('rounds seconds up to whole minutes, minimum 1', () => {
    expect(rateLimitedMinutes(1)).toBe(1);
    expect(rateLimitedMinutes(60)).toBe(1);
    expect(rateLimitedMinutes(61)).toBe(2);
    expect(rateLimitedMinutes(600)).toBe(10);
    expect(rateLimitedMinutes(undefined)).toBe(1);
  });
});

describe('Change 49: pages show a localised "too many attempts" message', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());
  const mockFetch = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

  it('login (en): says how many minutes to wait, not the raw server text', async () => {
    mockFetch().mockResolvedValueOnce(limited(600));
    render(<LocaleProvider locale="en"><LoginPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'whatever' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many attempts. Please try again in 10 minutes.');
    expect(alert).not.toHaveTextContent('English server text');
  });

  it('login (zh-TW) and singular minute', async () => {
    mockFetch().mockResolvedValueOnce(limited(30));
    render(<LocaleProvider locale="zh-TW"><LoginPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(/帳號/), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText(/^密碼/), { target: { value: 'whatever' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('嘗試次數過多，請 1 分鐘後再試。');
  });

  it('login (en) uses the singular for exactly one minute', async () => {
    mockFetch().mockResolvedValueOnce(limited(45));
    render(<LocaleProvider locale="en"><LoginPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('try again in 1 minute.');
  });

  it('forgot: a 429 is shown as an error — NOT as "reset link sent"', async () => {
    mockFetch().mockResolvedValueOnce(limited(1800));
    render(<LocaleProvider locale="en"><ForgotPasswordPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('try again in 30 minutes');
    expect(screen.queryByText(/reset link is on its way/)).not.toBeInTheDocument();
  });

  it('forgot: a normal 200 still shows the "sent" message', async () => {
    mockFetch().mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ data: { ok: true } }) } as unknown as Response);
    render(<LocaleProvider locale="en"><ForgotPasswordPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /Send reset link/ }));
    await waitFor(() => expect(screen.getByText(/reset link is on its way/)).toBeInTheDocument());
  });

  it('reset: a 429 is not reported as an invalid link', async () => {
    mockFetch().mockResolvedValueOnce(limited(3000));
    render(<LocaleProvider locale="en"><ResetPasswordPage /></LocaleProvider>);
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'GoodPass#9' } });
    fireEvent.click(screen.getByRole('button', { name: /reset|save|set/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('try again in 50 minutes');
    expect(alert).not.toHaveTextContent('invalid or has expired');
  });
});
