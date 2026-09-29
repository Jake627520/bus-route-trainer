import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { RegisterDriverUseCase, UsernameTakenError } from '@/application/auth/register-driver-use-case';
import { hashPassword } from '@/infrastructure/auth/password-hasher';

const prisma = new PrismaClient();
const registerUseCase = new RegisterDriverUseCase(new PrismaDriverAccountRepository(prisma), hashPassword);

const badRequest = (message: string) =>
  NextResponse.json({ error: { code: 'INVALID_REQUEST', message } }, { status: 400 });

/** Change 25: POST /api/auth/register — 開放自助註冊。 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON');
  }
  const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 4) {
    return badRequest('username required and password must be at least 4 characters');
  }
  try {
    const driver = await registerUseCase.execute({ username: username.trim(), password });
    return NextResponse.json({ data: driver }, { status: 201 });
  } catch (e) {
    if (e instanceof UsernameTakenError) {
      return NextResponse.json({ error: { code: 'USERNAME_TAKEN', message: e.message } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 });
  }
}
