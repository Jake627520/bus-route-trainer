import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AuthStatus } from '@/app/_components/auth-status';
import { apiClient } from '@/app/_lib/api-client';
import { LocaleProvider } from '@/app/_components/locale-provider';

/**
 * Change 26 Task 6: 首頁登入帳號顯示 + 登出鈕。
 */
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('Change 26: AuthStatus', () => {
  beforeEach(() => push.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('shows the logged-in username and a logout button', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({ id: 'd1', username: 'alice' });
    render(<LocaleProvider locale="zh-TW"><AuthStatus /></LocaleProvider>);
    expect(await screen.findByText(/alice/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登出/ })).toBeInTheDocument();
  });

  it('renders nothing when not signed in', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue(null);
    const { container } = render(<LocaleProvider locale="zh-TW"><AuthStatus /></LocaleProvider>);
    await waitFor(() => expect(apiClient.getMe).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('logs out and redirects to /login', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({ id: 'd1', username: 'alice' });
    const logoutSpy = vi.spyOn(apiClient, 'logout').mockResolvedValue();
    render(<LocaleProvider locale="zh-TW"><AuthStatus /></LocaleProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /登出/ }));
    await waitFor(() => expect(logoutSpy).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/login');
  });
});
