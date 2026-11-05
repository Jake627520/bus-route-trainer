import { NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/db/prisma';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import {
  EnrollVariantUseCase,
  VariantNotFoundError,
} from '@/application/learning/enroll-variant-use-case';
import {
  readSessionDriverId,
  unauthorizedResponse,
  SessionLookupError,
  sessionUnavailableResponse,
} from '@/app/_lib/session';

const learningRepo = new PrismaLearningProgressRepository(prisma);
const gtfsReadRepo = new PrismaGtfsReadRepository(prisma);
const getRouteVariantsUseCase = new GetRouteVariantsUseCase(gtfsReadRepo);
const enrollVariantUseCase = new EnrollVariantUseCase(learningRepo, getRouteVariantsUseCase);

export async function POST(request: Request) {
  try {
    const driverId = await readSessionDriverId(request);
    if (!driverId) return unauthorizedResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON' } },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Request body must be an object' } },
        { status: 400 }
      );
    }

    const { routeId, variantKey } = body as { routeId?: string; variantKey?: string };

    if (!routeId || typeof routeId !== 'string' || !variantKey || typeof variantKey !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Both routeId and variantKey are required non-empty strings',
          },
        },
        { status: 400 }
      );
    }

    const result = await enrollVariantUseCase.execute({ driverId, routeId, variantKey });

    const status = result.isNew ? 201 : 200;
    return NextResponse.json({ data: result.progress }, { status });
  } catch (error: unknown) {
    if (error instanceof SessionLookupError) return sessionUnavailableResponse();
    if (error instanceof VariantNotFoundError) {
      return NextResponse.json(
        { error: { code: 'VARIANT_NOT_FOUND', message: error.message } },
        { status: 404 }
      );
    }

    // 內部錯誤只寫 log，不把訊息（可能含 Prisma 表名/欄位）回給客戶端。
    console.error('POST /api/progress/enroll failed', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    );
  }
}
