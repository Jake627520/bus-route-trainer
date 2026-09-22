import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import {
  assertNoClientDriverId,
  resolveAuthenticatedDriver,
} from '@/application/recall/api/driver-context';
import { handleApiError } from '@/application/recall/api/error-mapper';

const prisma = new PrismaClient();
const useCases = createRecallUseCases(prisma);

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
