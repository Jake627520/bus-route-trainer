import type { Clock } from '@/application/common/clock';
import { RATE_RETENTION_MS, type RateRule } from '@/domain/auth/rate-limit-policy';
import type { RateLimitRepository } from './rate-limit.port';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly count: number;
  readonly limit: number;
  /** 時間窗還剩幾秒（被擋時給 Retry-After 用）。 */
  readonly retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  /** 這次寫入要不要順便清過期列。預設約 2% 機率。 */
  readonly shouldCleanup?: () => boolean;
  /** 限流元件自己出錯時的記錄（預設 console.error）。 */
  readonly onError?: (error: unknown) => void;
}

/**
 * Change 49: 固定時間窗限流。
 * 限流元件自己故障時一律 fail-open（放行並記錄），不讓它拖垮登入。
 */
export class RateLimiter {
  private readonly shouldCleanup: () => boolean;
  private readonly onError: (error: unknown) => void;

  constructor(
    private readonly repo: RateLimitRepository,
    private readonly clock: Clock,
    options: RateLimiterOptions = {}
  ) {
    this.shouldCleanup = options.shouldCleanup ?? (() => Math.random() < 0.02);
    this.onError = options.onError ?? ((e) => console.error('[rate-limit] store error, failing open:', e));
  }

  private window(rule: RateRule): { start: Date; retryAfterSeconds: number } {
    const nowMs = this.clock.now().getTime();
    const startMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
    return {
      start: new Date(startMs),
      retryAfterSeconds: Math.max(1, Math.ceil((startMs + rule.windowMs - nowMs) / 1000)),
    };
  }

  private key(rule: RateRule, id: string): string {
    return `${rule.name}:${id}`;
  }

  private openDecision(rule: RateRule, retryAfterSeconds = 1): RateLimitDecision {
    return { allowed: true, count: 0, limit: rule.limit, retryAfterSeconds };
  }

  /** 算一次嘗試：計數 +1；超過 limit 就擋。 */
  async hit(rule: RateRule, id: string): Promise<RateLimitDecision> {
    const { start, retryAfterSeconds } = this.window(rule);
    try {
      const count = await this.repo.increment(this.key(rule, id), start);
      await this.maybeCleanup();
      return { allowed: count <= rule.limit, count, limit: rule.limit, retryAfterSeconds };
    } catch (e) {
      this.onError(e);
      return this.openDecision(rule, retryAfterSeconds);
    }
  }

  /** 只讀不計數：已經用掉 limit 次就擋（用於「失敗達 N 次即鎖」）。 */
  async check(rule: RateRule, id: string): Promise<RateLimitDecision> {
    const { start, retryAfterSeconds } = this.window(rule);
    try {
      const count = await this.repo.count(this.key(rule, id), start);
      return { allowed: count < rule.limit, count, limit: rule.limit, retryAfterSeconds };
    } catch (e) {
      this.onError(e);
      return this.openDecision(rule, retryAfterSeconds);
    }
  }

  /** 忘掉某個 id（例如登入成功後清除失敗計數）。 */
  async clear(rule: RateRule, id: string): Promise<void> {
    try {
      await this.repo.clear(this.key(rule, id));
    } catch (e) {
      this.onError(e);
    }
  }

  private async maybeCleanup(): Promise<void> {
    if (!this.shouldCleanup()) return;
    try {
      await this.repo.deleteOlderThan(new Date(this.clock.now().getTime() - RATE_RETENTION_MS));
    } catch (e) {
      this.onError(e); // 清理失敗不影響這次請求
    }
  }
}
