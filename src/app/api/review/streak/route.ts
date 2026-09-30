import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaPracticeStatsAdapter } from '@/infrastructure/recall/prisma-practice-stats-adapter';
import { GetPracticeStreakUseCase } from '@/application/learning/get-practice-streak-use-case';
import { SystemClock } from '@/application/common/clock';
import { readSessionDriverId, unauthorizedResponse } from '@/app/_lib/session';

const prisma = new PrismaClient();
const getPracticeStreakUseCase = new GetPracticeStreakUseCase(
  new PrismaPracticeStatsAdapter(prisma),
  new SystemClock()
);

/**
 * Change 22 / 26: GET /api/review/streak
 * 回傳登入司機（或未登入時 DEFAULT）的練習連續天數（current/longest）與最近練習日。
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const driverId = readSessionDriverId(request);
    if (!driverId) return unauthorizedResponse();
    const data = await getPracticeStreakUseCase.execute({ driverId });
    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
