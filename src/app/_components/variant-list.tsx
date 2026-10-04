'use client';

import { useEffect, useState } from 'react';
import {
  apiClient,
  ApiError,
  type RouteVariant,
  type ProgressStatus,
} from '@/app/_lib/api-client';
import { MasteryTrend } from '@/app/_components/mastery-trend';
import { AccuracyStat } from '@/app/_components/accuracy-stat';
import { useT } from '@/app/_components/locale-provider';
import type { TFunction } from '@/i18n/t';

function directionLabel(t: TFunction, id: number): string {
  if (id === 0) return t('common.directionOutbound');
  if (id === 1) return t('common.directionInbound');
  return t('common.directionOther', { id });
}

type ListState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; variants: RouteVariant[] };

interface RowState {
  enrolling: boolean;
  enrolledStatus: ProgressStatus | null;
  error: string | null;
}

/**
 * Change 07 / 12: 某路線的 variant 列表（client component）。
 * 渲染各 variant（headsign / 站數 / 方向）與各自報名狀態。
 * 載入時並行抓 review summary，反映「既有報名」；未報名者可點「報名」
 * → POST /api/progress/enroll → 該列更新。summary 為增益資料，失敗則安靜降級為未報名。
 */
export function VariantList({ routeId }: { routeId: string }) {
  const t = useT();
  const [state, setState] = useState<ListState>({ phase: 'loading' });
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let active = true;

    apiClient
      .getRouteVariants(routeId)
      .then((variants) => {
        if (active) setState({ phase: 'ready', variants });
      })
      .catch((e) => {
        if (active) {
          setState({
            phase: 'error',
            message: e instanceof ApiError ? e.message : 'Unknown error',
          });
        }
      });

    // 增益：反映既有報名。失敗安靜降級（不影響 variant 主列表、不顯示錯誤）。
    apiClient
      .getReviewSummary()
      .then((summary) => {
        if (!active) return;
        setRows((prev) => {
          const next = { ...prev };
          for (const item of summary) {
            if (!next[item.variantKey]) {
              next[item.variantKey] = { enrolling: false, enrolledStatus: item.status, error: null };
            }
          }
          return next;
        });
      })
      .catch(() => {
        /* 安靜降級：維持未報名 */
      });

    return () => {
      active = false;
    };
  }, [routeId]);

  const handleEnroll = async (variantKey: string) => {
    setRows((prev) => ({
      ...prev,
      [variantKey]: {
        enrolling: true,
        enrolledStatus: prev[variantKey]?.enrolledStatus ?? null,
        error: null,
      },
    }));
    try {
      const progress = await apiClient.enroll({ routeId, variantKey });
      setRows((prev) => ({
        ...prev,
        [variantKey]: { enrolling: false, enrolledStatus: progress.status, error: null },
      }));
    } catch (e) {
      setRows((prev) => ({
        ...prev,
        [variantKey]: {
          enrolling: false,
          enrolledStatus: null,
          error: e instanceof ApiError ? e.message : t('variant.enrollFailed'),
        },
      }));
    }
  };

  if (state.phase === 'loading') {
    return (
      <p role="status" aria-live="polite" className="py-8 text-center text-zinc-500">
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
        {t('variant.loadError', { message: state.message })}
      </p>
    );
  }

  if (state.variants.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
        {t('variant.empty')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {state.variants.map((v) => {
        const row = rows[v.variantKey];
        const enrolledStatus = row?.enrolledStatus ?? null;
        return (
          <li
            key={v.variantKey}
            className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {directionLabel(t, v.directionId)}
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {v.headsign ?? t('common.noHeadsign')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {t('variant.stopsTrips', { stops: v.stopCount, trips: v.tripCount })}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  className="text-sm text-zinc-600 dark:text-zinc-300"
                  data-testid={`status-${v.variantKey}`}
                >
                  {enrolledStatus ? t(`status.${enrolledStatus}`) : t('status.notEnrolled')}
                </span>
                {enrolledStatus ? (
                  <a
                    href={`/practice/recall?${new URLSearchParams({ routeId: v.routeId, variantKey: v.variantKey }).toString()}`}
                    className="inline-flex min-h-[36px] items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow dark:bg-brand-500 dark:hover:bg-brand-600"
                  >
                    {t('variant.startPractice')}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEnroll(v.variantKey)}
                    disabled={row?.enrolling}
                    aria-busy={row?.enrolling ? 'true' : undefined}
                    className="inline-flex min-h-[36px] items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {row?.enrolling ? t('variant.enrolling') : t('variant.enroll')}
                  </button>
                )}
              </div>
            </div>
            {row?.error ? (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {t('variant.enrollError', { message: row.error })}
              </p>
            ) : null}
            {enrolledStatus ? (
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <AccuracyStat variantKey={v.variantKey} />
                <div className="mt-2">
                  <MasteryTrend variantKey={v.variantKey} />
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
