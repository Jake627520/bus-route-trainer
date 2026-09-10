import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaGtfsReadRepository } from '@/infrastructure/gtfs/query/prisma-gtfs-read-repository';
import { ListRoutesUseCase } from '@/application/gtfs/list-routes-use-case';

const prisma = new PrismaClient();
const readRepository = new PrismaGtfsReadRepository(prisma);
const listRoutesUseCase = new ListRoutesUseCase(readRepository);

export async function GET(): Promise<NextResponse> {
  try {
    const routes = await listRoutesUseCase.execute();
    return NextResponse.json({ data: routes }, { status: 200 });
  } catch {
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
