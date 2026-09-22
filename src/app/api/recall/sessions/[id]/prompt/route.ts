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

    const result = await useCases.getSessionPrompt.execute({
      sessionId: sessionId.trim(),
      driverId,
    });

    // P0 Response Safety Invariant: Guarantee expectedAnswer is never serialized
    const safePromptDto = {
      sessionId: result.prompt.sessionId,
      promptIndex: result.prompt.promptIndex,
      totalCards: result.prompt.totalCards,
      cardId: result.prompt.cardId,
      cardKey: result.prompt.cardKey,
      recallMode: result.prompt.recallMode,
      givenReference: result.prompt.givenReference,
      startedAt: result.prompt.startedAt,
    };

    return NextResponse.json({ data: { prompt: safePromptDto } }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError(error);
  }
}
