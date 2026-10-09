import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LoginPage from '@/app/login/page';
import { LocaleProvider } from '@/app/_components/locale-provider';

/**
 * Change 25 Task 9 / 30: /login 頁（登入 + 註冊，mock fetch + router；i18n 以 zh-TW 斷言）。
 */
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const renderLogin = () =>
  render(
    <LocaleProvider locale="zh-TW">
      <LoginPage />
    </LocaleProvider>
  );

describe('Change 25: LoginPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (status: number, body: unknown): Response =>
    ({ status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response);

  beforeEach(() => {
    push.mockClear();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('submits login and redirects home on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(200, { data: { id: 'd1', username: 'alice' } }));
    renderLogin();

    fireEvent.change(screen.getByLabelText(/帳號/), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/密碼/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /^登入$/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/auth/login');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ username: 'alice', password: 'secret1' });
  });

  it('shows an error on invalid credentials', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password' } }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/帳號/), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText(/密碼/), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /^登入$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/帳號或密碼|Incorrect|錯誤/);
    expect(push).not.toHaveBeenCalled();
  });

  it('can switch to register mode and submit to the register endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(201, { data: { id: 'd2', username: 'bob' } }));
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /註冊/ })); // 切換到註冊
    fireEvent.change(screen.getByLabelText(/帳號/), { target: { value: 'bob' } });
    fireEvent.change(screen.getByLabelText(/密碼/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /建立帳號/ }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(String(mockFetch.mock.calls[0][0])).toContain('/api/auth/register');
  });

  // Change 41: 註冊可帶 email、登入頁有忘記密碼連結
  it('includes the optional email in the register payload when provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonRes(201, { data: { id: 'd3', username: 'cara' } }));
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /註冊/ }));
    fireEvent.change(screen.getByLabelText(/帳號/), { target: { value: 'cara' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'cara@x.com' } });
    fireEvent.change(screen.getByLabelText(/密碼/), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByRole('button', { name: /建立帳號/ }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      username: 'cara',
      password: 'secret1',
      email: 'cara@x.com',
    });
  });

  it('shows a forgot-password link in login mode', () => {
    renderLogin();
    const link = screen.getByRole('link', { name: /忘記密碼/ });
    expect(link).toHaveAttribute('href', '/forgot');
  });
});
