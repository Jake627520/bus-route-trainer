import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { RegisterDriverUseCase, UsernameTakenError, EmailTakenError } from '@/application/auth/register-driver-use-case';
import { hashPassword } from '@/infrastructure/auth/password-hasher';
import { validatePassword, describePasswordPolicy } from '@/domain/auth/password-policy';
import { getClientIp } from '@/app/_lib/client-ip';
import { createAuthRateGate, tooManyRequests } from '@/app/_lib/auth-rate-gate';
import { RATE_RULES } from '@/domain/auth/rate-limit-policy';

const prisma = new PrismaClient();
const gate = createAuthRateGate(prisma);
const registerUseCase = new RegisterDriverUseCase(new PrismaDriverAccountRepository(prisma), hashPassword);

const badRequest = (message: string) =>
  NextResponse.json({ error: { code: 'INVALID_REQUEST', message } }, { status: 400 });

/** Change 25: POST /api/auth/register — 開放自助註冊。 */
export async function POST(request: Request): Promise<NextResponse> {
  const ipDecision = await gate.hit(RATE_RULES.registerIp, getClientIp(request));
  if (!ipDecision.allowed) return tooManyRequests(ipDecision);

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
  if (typeof username !== 'string' || !username.trim()) {
    return badRequest('username is required');
  }
  if (typeof password !== 'string') {
    return badRequest('password is required');
  }
  // Change 42: 密碼強度政策（與 /api/auth/reset 共用同一條規則）
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    return NextResponse.json(
      {
        error: {
          code: 'WEAK_PASSWORD',
          message: describePasswordPolicy(),
          failedRules: passwordCheck.failed,
        },
      },
      { status: 400 },
    );
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
