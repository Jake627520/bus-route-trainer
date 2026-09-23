import Link from 'next/link';
import { VariantList } from '@/app/_components/variant-list';

export default async function RouteVariantsPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = await params;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← 回路線列表
      </Link>
      <header className="mb-8 mt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          路線 {routeId}
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          選一個方向／終點報名，開始練習。
        </p>
      </header>
      <VariantList routeId={routeId} />
    </main>
  );
}
