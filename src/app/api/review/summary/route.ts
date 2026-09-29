import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { GtfsVariantHeadsignAdapter } from '@/infrastructure/gtfs/gtfs-variant-headsign-adapter';
import { GetReviewSummaryUseCase } from '@/application/learning/get-review-summary-use-case';
import { SystemClock } from '@/application/common/clock';
import { resolveDriverId } from '@/app/_lib/session';

const prisma = new PrismaClient();
const progressRepository = new PrismaLearningProgressRepository(prisma);
const gtfsReadRepository = new PrismaGtfsReadRepository(prisma);
const headsignAdapter = new GtfsVariantHeadsignAdapter(new GetRouteVariantsUseCase(gtfsReadRepository));
const getReviewSummaryUseCase = new GetReviewSummaryUseCase(
  progressRepository,
  new SystemClock(),
  headsignAdapter
);

/**
 * Change 11 / 26: GET /api/review/summary
 * 回傳登入司機（或未登入時 DEFAULT）每個 enrolled variant 的複習彙總（到期/新卡/下次複習）。
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const summaries = await getReviewSummaryUseCase.execute({ driverId: resolveDriverId(request) });
    return NextResponse.json({ data: summaries }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
