import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaMasteryHistoryAdapter } from '@/infrastructure/recall/prisma-mastery-history-adapter';
import { GetMasteryTrendUseCase } from '@/application/learning/get-mastery-trend-use-case';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

const prisma = new PrismaClient();
const getMasteryTrendUseCase = new GetMasteryTrendUseCase(new PrismaMasteryHistoryAdapter(prisma));

/**
 * Change 17: GET /api/review/mastery-trend
 * 回傳 default driver 的每日精熟度時序（由 recall attempt 日誌重放）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await getMasteryTrendUseCase.execute({ driverId: DEFAULT_DRIVER_ID });
    return NextResponse.json({ data }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
