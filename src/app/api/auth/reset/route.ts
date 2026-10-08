import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { ResetPasswordUseCase, InvalidResetTokenError } from '@/application/auth/reset-password-use-case';
import { hashResetToken } from '@/infrastructure/auth/reset-token';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { SystemClock } from '@/application/common/clock';

const prisma = new PrismaClient();
const useCase = new ResetPasswordUseCase(new PrismaDriverAccountRepository(prisma), new SystemClock());

const badRequest = (message: string) =>
  NextResponse.json({ error: { code: 'INVALID_REQUEST', message } }, { status: 400 });

/** Change 41: POST /api/auth/reset — 以 token 設定新密碼。 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON');
  }
  const { token, password } = (body ?? {}) as { token?: unknown; password?: unknown };
  if (typeof token !== 'string' || !token.trim() || typeof password !== 'string' || password.length < 4) {
    return badRequest('token required and password must be at least 4 characters');
  }
  const { hash, salt } = await hashPassword(password);
  try {
    await useCase.execute({ tokenHash: hashResetToken(token.trim()), newPasswordHash: hash, newPasswordSalt: salt });
    return NextResponse.json({ data: { ok: true } }, { status: 200 });
  } catch (e) {
    if (e instanceof InvalidResetTokenError) {
      return NextResponse.json({ error: { code: 'INVALID_TOKEN', message: e.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }, { status: 500 });
  }
}
