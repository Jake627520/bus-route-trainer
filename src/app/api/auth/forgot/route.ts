import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaDriverAccountRepository } from '@/infrastructure/auth/prisma-driver-account-repository';
import { RequestPasswordResetUseCase } from '@/application/auth/request-password-reset-use-case';
import { createEmailSender } from '@/infrastructure/auth/resend-email-sender';
import { generateResetToken } from '@/infrastructure/auth/reset-token';
import { SystemClock } from '@/application/common/clock';

const prisma = new PrismaClient();
const useCase = new RequestPasswordResetUseCase(
  new PrismaDriverAccountRepository(prisma),
  createEmailSender(),
  new SystemClock(),
  generateResetToken
);

/** Change 41: POST /api/auth/forgot — 寄密碼重設連結。一律回 200（不洩漏 email 是否存在）。 */
export async function POST(request: Request): Promise<NextResponse> {
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
  const origin = new URL(request.url).origin;
  try {
    await useCase.execute({ email, resetUrlBase: `${origin}/reset` });
  } catch {
    // 寄信失敗等內部錯誤不阻斷、不洩漏；仍回 200。
  }
  return NextResponse.json({ data: { ok: true } }, { status: 200 });
}
