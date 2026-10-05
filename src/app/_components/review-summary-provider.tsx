'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError, type VariantReviewSummary } from '@/app/_lib/api-client';

/**
 * Change 37: 共用 review summary 快取。
 * 首頁上 HomeHero / ReviewReminder / BatchPracticeButton / ReviewDashboard 原本各自抓
 * `/api/review/summary`（4 次）。改用 Provider 抓一次共用；`useReviewSummary` 在沒有 Provider
 * 時自行抓（fallback），確保各元件可獨立使用與獨立測試。
 */
export interface ReviewSummaryState {
  /** null = 載入中；[] = 空；[...] = 有資料。 */
  summary: VariantReviewSummary[] | null;
  /** 有值＝載入失敗（供需要顯示錯誤的元件使用；其餘視為無資料）。 */
  error: string | null;
}

const ReviewSummaryContext = createContext<ReviewSummaryState | null>(null);

/** 內部：抓一次 summary（skip=true 時不抓，供有 Provider 時的 fallback hook 短路）。 */
function useFetchReviewSummary(skip: boolean): ReviewSummaryState {
  const [state, setState] = useState<ReviewSummaryState>({ summary: null, error: null });

  useEffect(() => {
    if (skip) return;
    let active = true;
    apiClient
      .getReviewSummary()
      .then((summary) => {
        if (active) setState({ summary, error: null });
      })
      .catch((e) => {
        if (active) setState({ summary: null, error: e instanceof ApiError ? e.message : 'Unknown error' });
      });
    return () => {
      active = false;
    };
  }, [skip]);

  return state;
}

export function ReviewSummaryProvider({ children }: { children: React.ReactNode }) {
  const state = useFetchReviewSummary(false);
  return <ReviewSummaryContext.Provider value={state}>{children}</ReviewSummaryContext.Provider>;
}

/** 取共用 summary；無 Provider 時自行抓（向下相容/獨立測試）。 */
export function useReviewSummary(): ReviewSummaryState {
  const ctx = useContext(ReviewSummaryContext);
  const own = useFetchReviewSummary(ctx !== null);
  return ctx ?? own;
}
