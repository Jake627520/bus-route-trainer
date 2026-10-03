'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/locale-provider';

/**
 * Change 25: 登入 / 註冊頁。成功登入 → 導向首頁；註冊成功 → 切換登入模式提示。
 */
export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: { message?: string } })?.error?.message ?? t('login.errorGeneric'));
        return;
      }
      if (mode === 'login') {
        router.push('/');
      } else {
        setMode('login');
        setPassword('');
        setInfo(t('login.registered'));
      }
    } catch {
      setError(t('login.errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {mode === 'login' ? t('login.title') : t('login.registerTitle')}
      </h1>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          {t('login.username')}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          {t('login.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        {info ? (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {mode === 'login' ? t('login.submit') : t('login.registerSubmit')}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
          setInfo(null);
        }}
        className="mt-4 text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        {mode === 'login' ? t('login.switchToRegister') : t('login.switchToLogin')}
      </button>
    </main>
  );
}
