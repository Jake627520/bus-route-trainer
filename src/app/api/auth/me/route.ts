import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { readSessionDriverId } from '@/app/_lib/session';

const prisma = new PrismaClient();
const repo = new PrismaDriverAccountRepository(prisma);

/** Change 26: GET /api/auth/me — 回目前登入司機 { id, username }；未登入 401。 */
export async function GET(request: Request): Promise<NextResponse> {
  const driverId = readSessionDriverId(request);
  if (!driverId) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } },
      { status: 401 }
    );
  }
  const account = await repo.findById(driverId);
  if (!account) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Session driver no longer exists' } },
      { status: 401 }
    );
  }
  return NextResponse.json({ data: { id: account.id, username: account.username } }, { status: 200 });
}
