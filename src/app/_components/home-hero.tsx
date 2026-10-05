'use client';

import { useEffect, useState } from 'react';
import { apiClient, type VariantReviewSummary, type PracticeStreak } from '@/app/_lib/api-client';
import { useT } from '@/app/_components/locale-provider';

interface HeroData {
  totalDue: number;
  topVariant: { routeId: string; variantKey: string } | null;
  streak: number;
}

/**
 * Change 36: 首頁深色漸層 feature 錨點。
 * Translink 深藍漸層卡（web-layout「深色區塊當強調」），彙總今日待複習數與連續天數，
 * 粉紅點綴。增益元件：載入中顯示骨架、錯誤時仍顯示問候。
 */
export function HomeHero() {
  const t = useT();
  const [data, setData] = useState<HeroData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([apiClient.getReviewSummary(), apiClient.getPracticeStreak()])
      .then(([summaryRes, streakRes]) => {
        if (!active) return;
        const summary: VariantReviewSummary[] = summaryRes.status === 'fulfilled' ? summaryRes.value : [];
        const streak: PracticeStreak | null = streakRes.status === 'fulfilled' ? streakRes.value : null;
        const totalDue = summary.reduce((sum, i) => sum + i.dueCount, 0);
        const top = summary.find((i) => i.dueCount > 0) ?? null;
        setData({
          totalDue,
          topVariant: top ? { routeId: top.routeId, variantKey: top.variantKey } : null,
          streak: streak?.currentStreak ?? 0,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const base =
    'relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-6 text-white shadow-[0_8px_30px_-12px_rgba(17,20,36,0.5)]';
  // 右上角粉紅光暈作為 Translink 點綴
  const glow = (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-pink-500/25 blur-3xl"
    />
  );

  if (loading) {
    return (
      <div className={base}>
        {glow}
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-24 rounded bg-white/20" />
          <div className="h-8 w-40 rounded bg-white/25" />
          <div className="h-3 w-32 rounded bg-white/15" />
        </div>
      </div>
    );
  }

  const d = data ?? { totalDue: 0, topVariant: null, streak: 0 };

  return (
    <div className={base}>
      {glow}
      <p className="text-sm font-medium text-white/70">{t('hero.greeting')}</p>

      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          {d.totalDue > 0 ? (
            <>
              <p className="text-4xl font-bold leading-none">{d.totalDue}</p>
              <p className="mt-1 text-sm text-white/70">{t('hero.dueLabel')}</p>
            </>
          ) : (
            <p className="text-2xl font-semibold">{t('hero.allCaughtUp')} 🎉</p>
          )}
        </div>

        {d.streak > 0 ? (
          <div>
            <p className="text-4xl font-bold leading-none text-pink-300">🔥 {d.streak}</p>
            <p className="mt-1 text-sm text-white/70">{t('hero.streakLabel')}</p>
          </div>
        ) : null}
      </div>

      {d.totalDue > 0 && d.topVariant ? (
        <a
          href={`/practice/recall?${new URLSearchParams({
            routeId: d.topVariant.routeId,
            variantKey: d.topVariant.variantKey,
          }).toString()}`}
          className="mt-5 inline-flex min-h-[40px] items-center rounded-lg bg-pink-700 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-800 hover:shadow active:translate-y-px"
        >
          {t('hero.reviewNow')}
        </a>
      ) : null}
    </div>
  );
}
