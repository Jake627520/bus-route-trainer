import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import { RecallMode } from '@/domain/recall/recall-session';
import {
  assertNoClientDriverId,
  resolveAuthenticatedDriver,
} from '@/application/recall/api/driver-context';
import { handleApiError } from '@/application/recall/api/error-mapper';

const prisma = new PrismaClient();
const useCases = createRecallUseCases(prisma);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteParams) {
  try {
    const { id: sessionId } = await context.params;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Session ID must be a non-empty string',
          },
        },
        { status: 400 },
      );
    }

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

    const { promptIndex, rawInput, recallMode } = body as {
      promptIndex?: unknown;
      rawInput?: unknown;
      recallMode?: unknown;
    };

    if (
      promptIndex === undefined ||
      typeof promptIndex !== 'number' ||
      !Number.isInteger(promptIndex) ||
      promptIndex < 0
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'promptIndex is required and must be a non-negative integer',
          },
        },
        { status: 400 },
      );
    }

    if (typeof rawInput !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'rawInput is required and must be a string',
          },
        },
        { status: 400 },
      );
    }

    if (
      recallMode !== undefined &&
      (typeof recallMode !== 'string' || !Object.values(RecallMode).includes(recallMode as RecallMode))
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: `recallMode must be one of: ${Object.values(RecallMode).join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    const driverId = resolveAuthenticatedDriver(request);

    const result = await useCases.submitSessionAnswer.execute({
      sessionId: sessionId.trim(),
      promptIndex,
      rawInput,
      recallMode: recallMode as RecallMode | undefined,
      driverId,
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
