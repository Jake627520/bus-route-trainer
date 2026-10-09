'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/app/_components/locale-provider';
import { PasswordRules } from '@/app/_components/password-rules';
import type { PasswordRuleCode } from '@/domain/auth/password-policy';

/**
 * Change 41 / 42: 密碼重設頁。讀 ?token=，填新密碼 → POST /api/auth/reset。
 * 顯示密碼規則，並在伺服器回報 WEAK_PASSWORD 時標出未通過項目。
 * useSearchParams 需包在 Suspense 內（Next 16 App Router）。
 */
function ResetPasswordInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failedRules, setFailedRules] = useState<readonly PasswordRuleCode[]>([]);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFailedRules([]);
    if (!token) {
      setError(t('reset.missingToken'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = (body as { error?: { code?: string; failedRules?: PasswordRuleCode[] } })?.error;
        if (err?.code === 'WEAK_PASSWORD') {
          setFailedRules(err.failedRules ?? []);
          setError(t('password.tooWeak'));
          return;
        }
        setError(t('reset.invalidToken'));
        return;
      }
      setDone(true);
    } catch {
      setError(t('reset.invalidToken'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t('reset.title')}
      </h1>

      {done ? (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {t('reset.success')}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            {t('reset.labelPassword')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <PasswordRules failed={failedRules} />

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            {t('reset.submit')}
          </button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-4 text-sm text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
      >
        {t('reset.goToLogin')}
      </Link>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
