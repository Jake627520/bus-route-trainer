'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 41: 忘記密碼頁。送出 email → POST /api/auth/forgot（永遠回 200，不洩漏帳號是否存在）。
 * 送出後一律顯示「若已註冊則信已寄出」提示。
 */
export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // 不洩漏任何狀態，一律視為已送出。
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t('forgot.title')}
      </h1>

      {sent ? (
        <p role="status" className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
          {t('forgot.sent')}
        </p>
      ) : (
        <>
          <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('forgot.instruction')}</p>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              {t('forgot.labelEmail')}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              {t('forgot.submit')}
            </button>
          </form>
        </>
      )}

      <Link
        href="/login"
        className="mt-4 text-sm text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
      >
        {t('forgot.backToLogin')}
      </Link>
    </main>
  );
}
