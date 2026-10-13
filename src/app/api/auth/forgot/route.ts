import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { RequestPasswordResetUseCase } from '@/application/auth/request-password-reset-use-case';
import { createEmailSender } from '@/infrastructure/auth/resend-email-sender';
import { generateResetToken } from '@/infrastructure/auth/reset-token';
import { SystemClock } from '@/application/common/clock';
import { getClientIp } from '@/app/_lib/client-ip';
import { createAuthRateGate, tooManyRequests, rateKey } from '@/app/_lib/auth-rate-gate';
import { RATE_RULES } from '@/domain/auth/rate-limit-policy';

const prisma = new PrismaClient();
const gate = createAuthRateGate(prisma);
const useCase = new RequestPasswordResetUseCase(
  new PrismaDriverAccountRepository(prisma),
  createEmailSender(),
  new SystemClock(),
  generateResetToken
);

/** Change 41: POST /api/auth/forgot — 寄密碼重設連結。一律回 200（不洩漏 email 是否存在）。 */
export async function POST(request: Request): Promise<NextResponse> {
  const ipDecision = await gate.hit(RATE_RULES.forgotIp, getClientIp(request));
  if (!ipDecision.allowed) return tooManyRequests(ipDecision);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON' } }, { status: 400 });
  }
  const { email } = (body ?? {}) as { email?: unknown };
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'email is required' } }, { status: 400 });
  }
  // Change 49: 同一 email 每小時最多 3 封。超限時照常回 200 但不寄信，
  // 使回應無法用來判斷該 email 是否存在。
  const emailDecision = await gate.hit(RATE_RULES.forgotEmail, rateKey(email.trim().toLowerCase()));
  if (!emailDecision.allowed) {
    return NextResponse.json({ data: { ok: true } }, { status: 200 });
  }
  const origin = new URL(request.url).origin;
  try {
    await useCase.execute({ email, resetUrlBase: `${origin}/reset` });
  } catch {
    // 寄信失敗等內部錯誤不阻斷、不洩漏；仍回 200。
  }
  return NextResponse.json({ data: { ok: true } }, { status: 200 });
}
