import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaPracticeStatsAdapter } from '@/infrastructure/recall/prisma-practice-stats-adapter';
import { GetPracticeAccuracyUseCase } from '@/application/learning/get-practice-accuracy-use-case';
import { resolveDriverId } from '@/app/_lib/session';

const prisma = new PrismaClient();
const getPracticeAccuracyUseCase = new GetPracticeAccuracyUseCase(new PrismaPracticeStatsAdapter(prisma));

/**
 * Change 20: GET /api/review/accuracy
 * 回傳 default driver 的整體練習正確率。
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const variantKey = new URL(request.url).searchParams.get('variantKey') ?? undefined;
    const data = await getPracticeAccuracyUseCase.execute({ driverId: resolveDriverId(request), variantKey });
    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
