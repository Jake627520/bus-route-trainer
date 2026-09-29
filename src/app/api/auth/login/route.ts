import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { AuthenticateDriverUseCase } from '@/application/auth/authenticate-driver-use-case';
import { verifyPassword } from '@/infrastructure/auth/password-hasher';
import { sessionSetCookie } from '@/app/_lib/session';

const prisma = new PrismaClient();
const authUseCase = new AuthenticateDriverUseCase(new PrismaDriverAccountRepository(prisma), verifyPassword);

/** Change 25: POST /api/auth/login — 成功設 httpOnly session cookie。 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON' } }, { status: 400 });
  }
  const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'username and password are required' } }, { status: 400 });
  }

  const driver = await authUseCase.execute({ username, password });
  if (!driver) {
    return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password' } }, { status: 401 });
  }

  return NextResponse.json(
    { data: driver },
    { status: 200, headers: { 'Set-Cookie': sessionSetCookie(driver.id) } }
  );
}
