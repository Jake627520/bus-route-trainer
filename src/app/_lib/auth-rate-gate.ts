import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { RateLimiter, type RateLimitDecision } from '@/application/auth/rate-limiter';
import { PrismaRateLimitRepository } from '@/infrastructure/auth/prisma-rate-limit-repository';
import { SystemClock } from '@/application/common/clock';
import type { RateRule } from '@/domain/auth/rate-limit-policy';

const ALLOW: RateLimitDecision = { allowed: true, count: 0, limit: Infinity, retryAfterSeconds: 1 };

/** 帳號／email 當 key 時的長度上限，避免有人塞超長字串進資料庫。 */
export const RATE_KEY_MAX = 200;
export const rateKey = (value: string): string => value.slice(0, RATE_KEY_MAX);

/**
 * Change 49: 認證路由用的限流入口。
 * RATE_LIMIT_DISABLED=1 時整個關閉（測試預設；也是緊急時的維運開關）。
 * 每次呼叫才讀環境變數，所以測試可以隨時切換。
 */
export class AuthRateGate {
  constructor(private readonly limiter: RateLimiter) {}

  private get disabled(): boolean {
    return process.env.RATE_LIMIT_DISABLED === '1';
  }

  hit(rule: RateRule, id: string): Promise<RateLimitDecision> {
    return this.disabled ? Promise.resolve(ALLOW) : this.limiter.hit(rule, id);
  }

  check(rule: RateRule, id: string): Promise<RateLimitDecision> {
    return this.disabled ? Promise.resolve(ALLOW) : this.limiter.check(rule, id);
  }

  async clear(rule: RateRule, id: string): Promise<void> {
    if (!this.disabled) await this.limiter.clear(rule, id);
  }
}

export function createAuthRateGate(prisma: PrismaClient): AuthRateGate {
  return new AuthRateGate(new RateLimiter(new PrismaRateLimitRepository(prisma), new SystemClock()));
}

/** 429：附 Retry-After 與可供前端顯示的剩餘秒數。 */
export function tooManyRequests(decision: RateLimitDecision): NextResponse {
  const minutes = Math.max(1, Math.ceil(decision.retryAfterSeconds / 60));
  return NextResponse.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    },
    { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } }
  );
}
