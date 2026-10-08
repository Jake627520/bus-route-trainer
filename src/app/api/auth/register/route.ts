import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { RegisterDriverUseCase, UsernameTakenError, EmailTakenError } from '@/application/auth/register-driver-use-case';
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
  const { username, password, email } = (body ?? {}) as {
    username?: unknown;
    password?: unknown;
    email?: unknown;
  };
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 4) {
    return badRequest('username required and password must be at least 4 characters');
  }
  // email 選填；若提供須為基本有效格式。
  const emailStr = typeof email === 'string' && email.trim() ? email.trim() : null;
  if (emailStr && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return badRequest('email is not a valid address');
  }
  try {
    const driver = await registerUseCase.execute({ username: username.trim(), password, email: emailStr });
    return NextResponse.json({ data: driver }, { status: 201 });
  } catch (e) {
    if (e instanceof UsernameTakenError) {
      return NextResponse.json({ error: { code: 'USERNAME_TAKEN', message: e.message } }, { status: 409 });
    }
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: { code: 'EMAIL_TAKEN', message: e.message } }, { status: 409 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 });
  }
}
