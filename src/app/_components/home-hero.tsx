'use client';

import { useT } from '@/app/_components/locale-provider';
import { useReviewSummary } from '@/app/_components/review-summary-provider';
import { useStreak } from '@/app/_components/practice-streak-provider';

/**
 * Change 36 / 37 / 38: 首頁深色漸層 feature 錨點（共用 summary + streak）。
 * Translink 深藍漸層卡（web-layout「深色區塊當強調」），彙總今日待複習數與連續天數，粉紅點綴。
 */
export function HomeHero() {
  const t = useT();
  const { summary } = useReviewSummary();
  const { streak: streakData } = useStreak();

  const loading = summary === null;
  const items = summary ?? [];
  const totalDue = items.reduce((sum, i) => sum + i.dueCount, 0);
  const top = items.find((i) => i.dueCount > 0) ?? null;
  const data = {
    totalDue,
    topVariant: top ? { routeId: top.routeId, variantKey: top.variantKey } : null,
    streak: streakData?.currentStreak ?? 0,
  };

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

  const d = data;

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
