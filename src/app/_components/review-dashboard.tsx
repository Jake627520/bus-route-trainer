'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ProgressBar } from '@/components/ui';
import {
  apiClient,
  ApiError,
  type VariantReviewSummary,
} from '@/app/_lib/api-client';

const DIRECTION_LABEL: Record<number, string> = { 0: '去程', 1: '返程' };

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
        載入中…
      </p>
    );
  }

  if (state.phase === 'error') {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        無法載入複習清單：{state.message}
      </p>
    );
  }

  if (state.items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
        尚未報名任何路線，先到下方選一條開始。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {state.items.map((item) => (
        <li
          key={item.variantKey}
          className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {DIRECTION_LABEL[item.directionId] ?? `方向 ${item.directionId}`}
              </span>
              <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {item.headsign ?? '未標示終點'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">路線 {item.routeId}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              {item.dueCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  {item.dueCount} 待複習
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                  無到期
                </span>
              )}
              {item.newCount > 0 ? (
                <span className="text-zinc-500">{item.newCount} 新卡</span>
              ) : null}
              {item.nextReviewAt ? (
                <span className="text-zinc-400">
                  下次複習 {formatDistanceToNow(new Date(item.nextReviewAt), { addSuffix: true })}
                </span>
              ) : null}
            </div>
            <div className="mt-2 max-w-[240px]">
              <ProgressBar current={item.masteredCount} total={item.totalCards} label="精熟度" />
            </div>
          </div>
          <a
            href={`/practice/recall?${new URLSearchParams({ routeId: item.routeId, variantKey: item.variantKey }).toString()}`}
            className="inline-flex min-h-[40px] shrink-0 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            開始複習
          </a>
        </li>
      ))}
    </ul>
  );
}
