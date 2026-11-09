import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import {
  GetVariantProgressUseCase,
  ProgressNotFoundError,
} from '@/application/learning/get-variant-progress-use-case';
import {
  readSessionDriverId,
  unauthorizedResponse,
  SessionLookupError,
  sessionUnavailableResponse,
} from '@/app/_lib/session';

const learningRepo = new PrismaLearningProgressRepository(prisma);
const gtfsReadRepo = new PrismaGtfsReadRepository(prisma);
const getRouteVariantsUseCase = new GetRouteVariantsUseCase(gtfsReadRepo);
const getVariantProgressUseCase = new GetVariantProgressUseCase(learningRepo, getRouteVariantsUseCase);

export async function GET(
  request: Request,
  context: { params: Promise<{ variantKey: string }> }
) {
  try {
    const driverId = await readSessionDriverId(request);
    if (!driverId) return unauthorizedResponse();

    const { variantKey } = await context.params;

    if (!variantKey) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'variantKey is required' } },
        { status: 400 }
      );
    }

    // Next.js App Router already provides the decoded parameter.
    // We strictly do NOT call decodeURIComponent again, avoiding double-decoding risks.
    const progress = await getVariantProgressUseCase.execute({ driverId, variantKey });

    return NextResponse.json({ data: progress }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof SessionLookupError) return sessionUnavailableResponse();
    if (error instanceof ProgressNotFoundError) {
      return NextResponse.json(
        { error: { code: 'PROGRESS_NOT_FOUND', message: error.message } },
        { status: 404 }
      );
    }

    // 內部錯誤只寫 log，不把訊息（可能含 Prisma 表名/欄位）回給客戶端。
    console.error('GET /api/progress/[variantKey] failed', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
