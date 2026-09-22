import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createRecallUseCases } from '@/infrastructure/recall/recall-composition';
import {
  assertNoClientDriverId,
  assertNoDriverIdInUrl,
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

    // P0 Security Invariant: Client is strictly forbidden from supplying driverId in URL query
    assertNoDriverIdInUrl(request);

    // If request contains a JSON body, ensure client didn't supply driverId
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        assertNoClientDriverId(body);
      } catch (e) {
        if (e instanceof Error && e.name === 'ClientSuppliedDriverIdError') {
          throw e;
        }
        // If empty body or other parse error on optional body, proceed
      }
    }

    const driverId = resolveAuthenticatedDriver(request);

    const result = await useCases.abandonSession.execute({
      sessionId: sessionId.trim(),
      driverId,
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
