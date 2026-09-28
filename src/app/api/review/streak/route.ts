import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaPracticeStatsAdapter } from '@/infrastructure/recall/prisma-practice-stats-adapter';
import { GetPracticeStreakUseCase } from '@/application/learning/get-practice-streak-use-case';
import { SystemClock } from '@/application/common/clock';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

const prisma = new PrismaClient();
const getPracticeStreakUseCase = new GetPracticeStreakUseCase(
  new PrismaPracticeStatsAdapter(prisma),
  new SystemClock()
);

/**
 * Change 22: GET /api/review/streak
 * 回傳 default driver 的練習連續天數（current/longest）與最近練習日。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await getPracticeStreakUseCase.execute({ driverId: DEFAULT_DRIVER_ID });
    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
