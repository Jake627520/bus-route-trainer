'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient, ApiError, type RouteSummary } from '@/app/_lib/api-client';

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
  const [state, setState] = useState<State>({ phase: 'loading' });

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
    return (
      <p role="status" aria-live="polite" className="py-8 text-center text-zinc-500">
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
        無法載入路線：{state.message}
      </p>
    );
  }

  if (state.routes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
        目前沒有可用的路線。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {state.routes.map((route) => (
        <li key={route.id}>
          <Link
            href={`/routes/${route.id}`}
            className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <span className="inline-flex min-w-[3rem] justify-center rounded-md bg-zinc-900 px-2 py-1 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
              {route.shortName}
            </span>
            <span className="text-zinc-800 dark:text-zinc-200">{route.longName}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
