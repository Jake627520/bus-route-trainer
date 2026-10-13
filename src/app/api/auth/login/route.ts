import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { AuthenticateDriverUseCase } from '@/application/auth/authenticate-driver-use-case';
import { verifyPassword } from '@/infrastructure/auth/password-hasher';
import { sessionSetCookie } from '@/app/_lib/session';
import { getClientIp } from '@/app/_lib/client-ip';
import { createAuthRateGate, tooManyRequests, rateKey } from '@/app/_lib/auth-rate-gate';
import { RATE_RULES } from '@/domain/auth/rate-limit-policy';

const prisma = new PrismaClient();
const gate = createAuthRateGate(prisma);
const authUseCase = new AuthenticateDriverUseCase(new PrismaDriverAccountRepository(prisma), verifyPassword);

/** Change 25: POST /api/auth/login — 成功設 httpOnly session cookie。 */
export async function POST(request: Request): Promise<NextResponse> {
  // Change 49: 每個 IP 的所有嘗試先算次數。
  const ipDecision = await gate.hit(RATE_RULES.loginIp, getClientIp(request));
  if (!ipDecision.allowed) return tooManyRequests(ipDecision);

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

  // Change 49: 同一帳號失敗達上限 → 暫時鎖定（連正確密碼也先擋），時間窗結束自動解除。
  const userKey = rateKey(username);
  const lock = await gate.check(RATE_RULES.loginFailUser, userKey);
  if (!lock.allowed) return tooManyRequests(lock);

  const driver = await authUseCase.execute({ username, password });
  if (!driver) {
    await gate.hit(RATE_RULES.loginFailUser, userKey);
    return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect username or password' } }, { status: 401 });
  }

  await gate.clear(RATE_RULES.loginFailUser, userKey); // 成功登入即清除失敗計數
  return NextResponse.json(
    { data: driver },
    { status: 200, headers: { 'Set-Cookie': sessionSetCookie(driver.id) } }
  );
}
