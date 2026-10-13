import type { PrismaClient } from '@prisma/client';
import type { RateLimitRepository } from '@/application/auth/rate-limit.port';

/**
 * Change 49: 以 Postgres 儲存限流計數。
 * 遞增用單一 `INSERT … ON CONFLICT DO UPDATE … RETURNING`，由資料庫保證原子，
 * 並發請求不會漏算。
 */
export class PrismaRateLimitRepository implements RateLimitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async increment(key: string, windowStart: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "auth_rate_limit" ("key", "window_start", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "window_start")
      DO UPDATE SET "count" = "auth_rate_limit"."count" + 1
      RETURNING "count"
    `;
    return Number(rows[0].count);
  }

  async count(key: string, windowStart: Date): Promise<number> {
    const row = await this.prisma.authRateLimit.findUnique({
      where: { key_windowStart: { key, windowStart } },
      select: { count: true },
    });
    return row?.count ?? 0;
  }

  async clear(key: string): Promise<void> {
    await this.prisma.authRateLimit.deleteMany({ where: { key } });
  }

  async deleteOlderThan(date: Date): Promise<void> {
    await this.prisma.authRateLimit.deleteMany({ where: { windowStart: { lt: date } } });
  }
}
