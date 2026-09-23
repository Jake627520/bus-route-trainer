import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { GetReviewSummaryUseCase } from '@/application/learning/get-review-summary-use-case';
import { SystemClock } from '@/application/common/clock';
import { DEFAULT_DRIVER_ID } from '@/application/learning/auth-constants';

const prisma = new PrismaClient();
const progressRepository = new PrismaLearningProgressRepository(prisma);
const getReviewSummaryUseCase = new GetReviewSummaryUseCase(progressRepository, new SystemClock());

/**
 * Change 11: GET /api/review/summary
 * 回傳 default driver 每個 enrolled variant 的複習彙總（到期/新卡/下次複習）。
 * Zero-auth：driver 用 DEFAULT_DRIVER_ID，client 不送 driverId。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const summaries = await getReviewSummaryUseCase.execute({ driverId: DEFAULT_DRIVER_ID });
    return NextResponse.json({ data: summaries }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
