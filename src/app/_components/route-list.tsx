'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient, ApiError, type RouteSummary } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';
import { SkeletonList } from '@/components/ui';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; routes: RouteSummary[] };

/**
 * Change 07: 路線列表（client component）。
 * 載入中 / 成功（渲染 shortName + longName，可點進 variants）/ 空清單 / 錯誤 四態。
 * 只透過 apiClient 串現有 GET /api/routes，不直接碰 Prisma。
 */
export function RouteList() {
  const t = useT();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    apiClient
      .getRoutes()
      .then((routes) => {
        if (active) setState({ phase: 'ready', routes });
      })
      .catch((e) => {
        if (active) {
          setState({
            phase: 'error',
            message: e instanceof ApiError ? e.message : 'Unknown error',
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.phase === 'loading') {
    return <SkeletonList rows={4} />;
  }

  if (state.phase === 'error') {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        {t('routeList.loadError', { message: state.message })}
      </p>
    );
  }

  if (state.routes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
        {t('routeList.empty')}
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? state.routes.filter(
        (r) =>
          r.shortName.toLowerCase().includes(q) || r.longName.toLowerCase().includes(q)
      )
    : state.routes;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        aria-label={t('routeList.searchAria')}
        placeholder={t('routeList.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {t('routeList.noMatch')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((route) => (
            <li key={route.id}>
              <Link
                href={`/routes/${route.id}`}
                className="flex items-center gap-4 rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-700"
              >
                <span className="inline-flex min-w-[3rem] justify-center rounded-md bg-brand-600 px-2 py-1 text-sm font-bold text-white dark:bg-brand-500">
                  {route.shortName}
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{route.longName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
