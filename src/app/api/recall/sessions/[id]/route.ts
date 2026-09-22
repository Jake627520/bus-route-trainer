import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import {
  resolveAuthenticatedDriver,
  assertNoDriverIdInUrl,
} from '@/application/recall/api/driver-context';
import { handleApiError } from '@/application/recall/api/error-mapper';

const prisma = new PrismaClient();
const useCases = createRecallUseCases(prisma);

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteParams) {
  try {
    // P0 Security Invariant: Client is strictly forbidden from supplying driverId in query
    assertNoDriverIdInUrl(request);

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

    const driverId = resolveAuthenticatedDriver(request);

    const result = await useCases.getSessionState.execute({
      sessionId: sessionId.trim(),
      driverId,
    });

    // Explicit DTO response boundary: guarantee no internal or sensitive fields leaked
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
