import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLearningProgressRepository } from '@/infrastructure/learning/prisma-learning-progress-repository';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import {
  GetVariantProgressUseCase,
  ProgressNotFoundError,
} from '@/application/learning/get-variant-progress-use-case';

const prisma = new PrismaClient();
const learningRepo = new PrismaLearningProgressRepository(prisma);
const gtfsReadRepo = new PrismaGtfsReadRepository(prisma);
const getRouteVariantsUseCase = new GetRouteVariantsUseCase(gtfsReadRepo);
const getVariantProgressUseCase = new GetVariantProgressUseCase(learningRepo, getRouteVariantsUseCase);

export async function GET(
  _request: Request,
  context: { params: Promise<{ variantKey: string }> }
) {
  try {
    const { variantKey } = await context.params;

    if (!variantKey) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'variantKey is required' } },
        { status: 400 }
      );
    }

    // Next.js App Router already provides the decoded parameter.
    // We strictly do NOT call decodeURIComponent again, avoiding double-decoding risks.
    const progress = await getVariantProgressUseCase.execute({ variantKey });

    return NextResponse.json({ data: progress }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof ProgressNotFoundError) {
      return NextResponse.json(
        { error: { code: 'PROGRESS_NOT_FOUND', message: error.message } },
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
