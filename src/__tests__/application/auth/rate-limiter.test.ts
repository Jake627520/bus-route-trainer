import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '@/application/auth/rate-limiter';
import type { RateLimitRepository } from '@/application/auth/rate-limit.port';
import type { RateRule } from '@/domain/auth/rate-limit-policy';

class MemoryRepo implements RateLimitRepository {
  rows = new Map<string, number>();
  cleanedBefore: Date | null = null;
  private k = (key: string, w: Date) => `${key}@${w.getTime()}`;
  async increment(key: string, windowStart: Date) {
    const k = this.k(key, windowStart);
    const n = (this.rows.get(k) ?? 0) + 1;
    this.rows.set(k, n);
    return n;
  }
  async count(key: string, windowStart: Date) {
    return this.rows.get(this.k(key, windowStart)) ?? 0;
  }
  async clear(key: string) {
    for (const k of [...this.rows.keys()]) if (k.startsWith(`${key}@`)) this.rows.delete(k);
  }
  async deleteOlderThan(date: Date) {
    this.cleanedBefore = date;
  }
}

const RULE: RateRule = { name: 'test', limit: 3, windowMs: 60_000 };
const make = (start = 1_000_000_000_000) => {
  let now = start;
  const repo = new MemoryRepo();
  const limiter = new RateLimiter(repo, { now: () => new Date(now) }, { shouldCleanup: () => false, onError: () => {} });
  return { repo, limiter, advance: (ms: number) => (now += ms), setNow: (n: number) => (now = n) };
};

describe('Change 49: RateLimiter', () => {
  it('allows up to `limit` hits in a window, then blocks', async () => {
    const { limiter } = make();
    for (let i = 1; i <= 3; i++) expect((await limiter.hit(RULE, 'ip1')).allowed).toBe(true);
    const blocked = await limiter.hit(RULE, 'ip1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(4);
  });

  it('counts each identifier separately', async () => {
    const { limiter } = make();
    for (let i = 0; i < 4; i++) await limiter.hit(RULE, 'ip1');
    expect((await limiter.hit(RULE, 'ip2')).allowed).toBe(true);
  });

  it('resets in the next window', async () => {
    const { limiter, setNow } = make(1_000_000_000_000);
    for (let i = 0; i < 4; i++) await limiter.hit(RULE, 'ip1');
    // jump to the start of the following window
    const windowEnd = (Math.floor(1_000_000_000_000 / 60_000) + 1) * 60_000;
    setNow(windowEnd);
    expect((await limiter.hit(RULE, 'ip1')).allowed).toBe(true);
  });

  it('tells how many seconds until the window ends', async () => {
    const windowStart = Math.floor(1_000_000_000_000 / 60_000) * 60_000;
    const { limiter } = make(windowStart + 20_000); // 40s left
    for (let i = 0; i < 3; i++) await limiter.hit(RULE, 'ip1');
    const d = await limiter.hit(RULE, 'ip1');
    expect(d.retryAfterSeconds).toBe(40);
  });

  it('check() reads without counting, and blocks once count >= limit', async () => {
    const { limiter } = make();
    expect((await limiter.check(RULE, 'u')).allowed).toBe(true);
    for (let i = 0; i < 3; i++) await limiter.hit(RULE, 'u');
    const d = await limiter.check(RULE, 'u');
    expect(d.allowed).toBe(false);
    expect(d.count).toBe(3); // unchanged by check()
    expect((await limiter.check(RULE, 'u')).count).toBe(3);
  });

  it('clear() forgets an identifier (e.g. after a successful login)', async () => {
    const { limiter } = make();
    for (let i = 0; i < 3; i++) await limiter.hit(RULE, 'u');
    await limiter.clear(RULE, 'u');
    expect((await limiter.check(RULE, 'u')).allowed).toBe(true);
  });

  it('fails open (allows + reports) when the store throws', async () => {
    const onError = vi.fn();
    const broken: RateLimitRepository = {
      increment: async () => { throw new Error('db down'); },
      count: async () => { throw new Error('db down'); },
      clear: async () => { throw new Error('db down'); },
      deleteOlderThan: async () => { throw new Error('db down'); },
    };
    const limiter = new RateLimiter(broken, { now: () => new Date() }, { shouldCleanup: () => false, onError });
    expect((await limiter.hit(RULE, 'x')).allowed).toBe(true);
    expect((await limiter.check(RULE, 'x')).allowed).toBe(true);
    await expect(limiter.clear(RULE, 'x')).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  it('opportunistically deletes rows older than one day', async () => {
    const repo = new MemoryRepo();
    const now = 1_000_000_000_000;
    const limiter = new RateLimiter(repo, { now: () => new Date(now) }, { shouldCleanup: () => true, onError: () => {} });
    await limiter.hit(RULE, 'x');
    expect(repo.cleanedBefore?.getTime()).toBe(now - 24 * 60 * 60 * 1000);
  });

  it('a cleanup failure never breaks the request', async () => {
    const repo = new MemoryRepo();
    repo.deleteOlderThan = async () => { throw new Error('boom'); };
    const limiter = new RateLimiter(repo, { now: () => new Date() }, { shouldCleanup: () => true, onError: () => {} });
    expect((await limiter.hit(RULE, 'x')).allowed).toBe(true);
  });
});
