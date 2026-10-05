import React from 'react';

/**
 * Change 36: 載入骨架（shimmer）。取代「載入中…」純文字，降低版面跳動與等待焦慮。
 * reduced-motion 時由 globals.css 關閉動畫（僅留靜態底色）。
 */
export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  ...props
}) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800/70 ${className}`}
    {...props}
  />
);

/** 卡片列表骨架：n 張與內容卡片等高的佔位。 */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className = '',
}) => (
  <div role="status" aria-live="polite" aria-busy="true" className={`flex flex-col gap-3 ${className}`}>
    <span className="sr-only">Loading…</span>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-9 w-20 shrink-0 rounded-lg" />
      </div>
    ))}
  </div>
);
