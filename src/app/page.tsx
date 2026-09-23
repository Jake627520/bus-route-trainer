import { RouteList } from '@/app/_components/route-list';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          路線記憶訓練器
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          選一條路線，開始練習記憶站序。
        </p>
      </header>
      <RouteList />
    </main>
  );
}
