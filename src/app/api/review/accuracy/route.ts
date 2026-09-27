import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaPracticeStatsAdapter } from '@/infrastructure/recall/prisma-practice-stats-adapter';
import { GetPracticeAccuracyUseCase } from '@/application/learning/get-practice-accuracy-use-case';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

const prisma = new PrismaClient();
const getPracticeAccuracyUseCase = new GetPracticeAccuracyUseCase(new PrismaPracticeStatsAdapter(prisma));

/**
 * Change 20: GET /api/review/accuracy
 * 回傳 default driver 的整體練習正確率。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await getPracticeAccuracyUseCase.execute({ driverId: DEFAULT_DRIVER_ID });
    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
