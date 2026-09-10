import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import {
  GetRouteVariantsUseCase,
  RouteNotFoundError,
} from '@/application/gtfs/get-route-variants-use-case';

const prisma = new PrismaClient();
const readRepository = new PrismaGtfsReadRepository(prisma);
const getRouteVariantsUseCase = new GetRouteVariantsUseCase(readRepository);

export async function GET(
  _request: Request,
  context: { params: Promise<{ routeId: string }> | { routeId: string } }
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const variants = await getRouteVariantsUseCase.execute(params.routeId);
    return NextResponse.json({ data: variants }, { status: 200 });
  } catch (err) {
    if (err instanceof RouteNotFoundError) {
      return NextResponse.json(
        {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: err.message,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 }
    );
  }
}
