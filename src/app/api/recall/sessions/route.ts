import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import {
  assertNoClientDriverId,
  resolveAuthenticatedDriver,
} from '@/application/recall/api/driver-context';
import { handleApiError } from '@/application/recall/api/error-mapper';
import { BackfillVariantCardsUseCase } from '@/application/learning/backfill-variant-cards-use-case';
import { PrismaBackfillCardsRepository } from '@/infrastructure/learning/prisma-backfill-cards-repository';
import { GetRouteVariantsUseCase } from '@/application/gtfs/get-route-variants-use-case';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';

const prisma = new PrismaClient();
const useCases = createRecallUseCases(prisma);

// Change 46: 既有報名補發新題型卡片（版本落後時才動作，O(1) 檢查）
const backfillCards = new BackfillVariantCardsUseCase(
  new PrismaBackfillCardsRepository(prisma),
  new GetRouteVariantsUseCase(new PrismaGtfsReadRepository(prisma)),
);

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'Request body must be an object' } },
        { status: 400 },
      );
    }

    // P0 Security Invariant: Client is strictly forbidden from specifying driverId
    assertNoClientDriverId(body);

    const { routeId, variantKey, sessionSize, dueRatio } = body as {
      routeId?: unknown;
      variantKey?: unknown;
      sessionSize?: unknown;
      dueRatio?: unknown;
    };

    if (typeof routeId !== 'string' || routeId.trim().length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'routeId is required and must be a non-empty string',
          },
        },
        { status: 400 },
      );
    }

    if (typeof variantKey !== 'string' || variantKey.trim().length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'variantKey is required and must be a non-empty string',
          },
        },
        { status: 400 },
      );
    }

    if (sessionSize !== undefined && (typeof sessionSize !== 'number' || !Number.isInteger(sessionSize) || sessionSize <= 0)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'sessionSize must be a positive integer if provided',
          },
        },
        { status: 400 },
      );
    }

    if (dueRatio !== undefined && (typeof dueRatio !== 'number' || dueRatio < 0 || dueRatio > 1)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'dueRatio must be a number between 0 and 1 if provided',
          },
        },
        { status: 400 },
      );
    }

    const driverId = resolveAuthenticatedDriver(request);

    // Change 46: 開練習前先補齊卡片；失敗不得影響開始練習
    try {
      await backfillCards.execute({ driverId, variantKey: variantKey.trim() });
    } catch (backfillError) {
      console.error('[Recall API] card backfill failed (continuing):', backfillError);
    }

    const result = await useCases.startPlannedSession.execute({
      driverId,
      routeId: routeId.trim(),
      variantKey: variantKey.trim(),
      sessionSize,
      dueRatio,
    });

    const status = result.isNew ? 201 : 200;
    return NextResponse.json({ data: result }, { status });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
