'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ProgressBar } from '@/components/ui';
import {
  apiClient,
  ApiError,
  type VariantReviewSummary,
} from '@/app/_lib/api-client';
import { useT, useLocale } from '@/app/_components/locale-provider';
import { dateFnsLocale } from '@/app/_lib/date-locale';
import type { TFunction } from '@/i18n/t';

/** 方向標籤：0=去程、1=返程、其餘=方向 N。 */
function directionLabel(t: TFunction, id: number): string {
  if (id === 0) return t('common.directionOutbound');
  if (id === 1) return t('common.directionInbound');
  return t('common.directionOther', { id });
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; items: VariantReviewSummary[] };

/**
 * Change 11: 複習到期儀表板（client component）。
 * 呼叫 GET /api/review/summary，依後端排序（到期多者在前）渲染各 variant 的
 * 到期數 / 新卡 / 下次複習時間，並提供「開始複習」入口。四態：載入中/成功/空/錯誤。
 */
export function ReviewDashboard() {
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let active = true;
    apiClient
      .getReviewSummary()
      .then((items) => {
        if (active) setState({ phase: 'ready', items });
      })
      .catch((e) => {
        if (active) {
          setState({ phase: 'error', message: e instanceof ApiError ? e.message : 'Unknown error' });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.phase === 'loading') {
    return (
      <p role="status" aria-live="polite" className="py-6 text-center text-zinc-500">
        {t('common.loading')}
      </p>
    );
  }

  if (state.phase === 'error') {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        {t('dashboard.loadError', { message: state.message })}
      </p>
    );
  }

  if (state.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
        {t('dashboard.empty')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {state.items.map((item) => (
        <li
          key={item.variantKey}
          className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {directionLabel(t, item.directionId)}
              </span>
              <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {item.headsign ?? t('common.noHeadsign')}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">{t('dashboard.routeLabel', { routeId: item.routeId })}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              {item.dueCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  {t('dashboard.due', { count: item.dueCount })}
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                  {t('dashboard.noDue')}
                </span>
              )}
              {item.newCount > 0 ? (
                <span className="text-zinc-500">{t('dashboard.newCards', { count: item.newCount })}</span>
              ) : null}
              {item.nextReviewAt ? (
                <span className="text-zinc-400">
                  {t('dashboard.nextReview', { time: formatDistanceToNow(new Date(item.nextReviewAt), { addSuffix: true, locale: dateFnsLocale(locale) }) })}
                </span>
              ) : null}
            </div>
            <div className="mt-2 max-w-[240px]">
              <ProgressBar current={item.masteredCount} total={item.totalCards} label={t('dashboard.masteryLabel')} />
            </div>
          </div>
          <a
            href={`/practice/recall?${new URLSearchParams({ routeId: item.routeId, variantKey: item.variantKey }).toString()}`}
            className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow dark:bg-brand-500 dark:hover:bg-brand-600"
          >
            {t('dashboard.start')}
          </a>
        </li>
      ))}
    </ul>
  );
}
