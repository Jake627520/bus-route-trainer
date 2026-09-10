import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import {
  EnrollVariantUseCase,
  VariantNotFoundError,
} from '@/application/learning/enroll-variant-use-case';

const prisma = new PrismaClient();
const learningRepo = new PrismaLearningProgressRepository(prisma);
const gtfsReadRepo = new PrismaGtfsReadRepository(prisma);
const getRouteVariantsUseCase = new GetRouteVariantsUseCase(gtfsReadRepo);
const enrollVariantUseCase = new EnrollVariantUseCase(learningRepo, getRouteVariantsUseCase);

export async function POST(request: Request) {
  try {
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

    const result = await enrollVariantUseCase.execute({ routeId, variantKey });

    const status = result.isNew ? 201 : 200;
    return NextResponse.json({ data: result.progress }, { status });
  } catch (error: unknown) {
    if (error instanceof VariantNotFoundError) {
      return NextResponse.json(
        { error: { code: 'VARIANT_NOT_FOUND', message: error.message } },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown internal error',
        },
      },
      { status: 500 }
    );
  }
}
