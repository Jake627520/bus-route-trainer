'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient, type PracticeStreak } from '@/app/_lib/api-client';

/**
 * Change 38: 共用 practice streak（與 Change 37 的 summary 同一 pattern）。
 * 首頁 HomeHero 與 StreakStat 原本各自抓 `/api/review/streak`。改用 Provider 抓一次共用；
 * `useStreak` 在無 Provider 時自行抓（fallback），確保各元件可獨立使用與獨立測試。
 */
export interface StreakState {
  /** null = 載入中 / 錯誤（視為無資料）。 */
  streak: PracticeStreak | null;
}

const StreakContext = createContext<StreakState | null>(null);

function useFetchStreak(skip: boolean): StreakState {
  const [state, setState] = useState<StreakState>({ streak: null });

  useEffect(() => {
    if (skip) return;
    let active = true;
    apiClient
      .getPracticeStreak()
      .then((streak) => {
        if (active) setState({ streak });
      })
      .catch(() => {
        /* 靜默：視為無資料 */
      });
    return () => {
      active = false;
    };
  }, [skip]);

  return state;
}

export function PracticeStreakProvider({ children }: { children: React.ReactNode }) {
  const state = useFetchStreak(false);
  return <StreakContext.Provider value={state}>{children}</StreakContext.Provider>;
}

/** 取共用 streak；無 Provider 時自行抓（向下相容/獨立測試）。 */
export function useStreak(): StreakState {
  const ctx = useContext(StreakContext);
  const own = useFetchStreak(ctx !== null);
  return ctx ?? own;
}
