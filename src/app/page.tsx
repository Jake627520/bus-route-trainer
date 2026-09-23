import { ReviewReminder } from '@/app/_components/review-reminder';
import { ReviewDashboard } from '@/app/_components/review-dashboard';
import { RouteList } from '@/app/_components/route-list';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          路線記憶訓練器
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          先看看今天要複習什麼，再選路線練習。
        </p>
      </header>

      <ReviewReminder />

      <section aria-labelledby="review-heading" className="mb-10">
        <h2
          id="review-heading"
          className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          待複習
        </h2>
        <ReviewDashboard />
      </section>

      <section aria-labelledby="routes-heading">
        <h2
          id="routes-heading"
          className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          所有路線
        </h2>
        <RouteList />
      </section>
    </main>
  );
}
