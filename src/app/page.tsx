import { ReviewNotifier } from '@/app/_components/review-notifier';
import { ReviewReminder } from '@/app/_components/review-reminder';
import { BatchPracticeButton } from '@/app/_components/batch-practice-button';
import { ReviewDashboard } from '@/app/_components/review-dashboard';
import { MasteryTrend } from '@/app/_components/mastery-trend';
import { AccuracyStat } from '@/app/_components/accuracy-stat';
import { StreakStat } from '@/app/_components/streak-stat';
import { RouteList } from '@/app/_components/route-list';
import { AuthStatus } from '@/app/_components/auth-status';
import { HomeHero } from '@/app/_components/home-hero';
import { T } from '@/app/_components/locale-provider';
import { ReviewSummaryProvider } from '@/app/_components/review-summary-provider';
import { PracticeStreakProvider } from '@/app/_components/practice-streak-provider';

export default function Home() {
  return (
    <ReviewSummaryProvider>
    <PracticeStreakProvider>
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <div className="mb-4 flex justify-end">
          <AuthStatus />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          <T k="home.title" />
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          <T k="home.subtitle" />
        </p>
      </header>

      <div className="mb-6">
        <HomeHero />
      </div>

      <div className="mb-4">
        <ReviewNotifier />
      </div>

      <ReviewReminder />

      <div className="mb-6">
        <BatchPracticeButton />
      </div>

      <section aria-labelledby="review-heading" className="mb-10">
        <h2
          id="review-heading"
          className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          <T k="home.sectionReview" />
        </h2>
        <ReviewDashboard />
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StreakStat />
        <AccuracyStat />
      </div>

      <section aria-labelledby="trend-heading" className="mb-10">
        <h2
          id="trend-heading"
          className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          <T k="home.sectionTrend" />
        </h2>
        <MasteryTrend />
      </section>

      <section aria-labelledby="routes-heading">
        <h2
          id="routes-heading"
          className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          <T k="home.sectionRoutes" />
        </h2>
        <RouteList />
      </section>
    </main>
    </PracticeStreakProvider>
    </ReviewSummaryProvider>
  );
}
