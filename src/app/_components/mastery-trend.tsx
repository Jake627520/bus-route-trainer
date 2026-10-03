'use client';

import { useEffect, useState } from 'react';
import { apiClient, type MasteryTrendPoint } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

/**
 * Change 17 / 31: 精熟度趨勢圖（client component，i18n）。手刻 inline SVG 折線圖。
 */
export function MasteryTrend({ variantKey }: { variantKey?: string } = {}) {
  const t = useT();
  const [points, setPoints] = useState<MasteryTrendPoint[] | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getMasteryTrend(variantKey)
      .then((p) => {
        if (active) setPoints(p);
      })
      .catch(() => {
        /* 靜默 */
      });
    return () => {
      active = false;
    };
  }, [variantKey]);

  if (points === null) return null; // 載入中 / 錯誤 → 不顯示

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        {t('masteryTrend.empty')}
      </p>
    );
  }

  const W = 320;
  const H = 96;
  const PAD = 12;
  const n = points.length;
  const maxCount = Math.max(1, ...points.map((p) => p.masteredCount));
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (c: number) => H - PAD - (c / maxCount) * (H - 2 * PAD);
  const line = points.map((p, i) => `${x(i)},${y(p.masteredCount)}`).join(' ');
  const area = `${PAD},${H - PAD} ${line} ${x(n - 1)},${H - PAD}`;

  return (
    <svg
      role="img"
      aria-label={t('masteryTrend.aria', { max: maxCount, days: n })}
      viewBox={`0 0 ${W} ${H}`}
      className="h-24 w-full text-sky-600 dark:text-sky-400"
      preserveAspectRatio="none"
    >
      <polygon points={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.date} data-testid="trend-point" cx={x(i)} cy={y(p.masteredCount)} r={3} fill="currentColor">
          <title>{t('masteryTrend.pointTitle', { date: p.date, count: p.masteredCount })}</title>
        </circle>
      ))}
    </svg>
  );
}
