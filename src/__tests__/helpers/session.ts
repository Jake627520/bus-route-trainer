import { signSession } from '@/infrastructure/auth/session-token';
import { SESSION_COOKIE, getAuthSecret } from '@/infrastructure/auth/session-cookie';

/** 測試用：產生指定 driver 的簽章 session cookie header 值（Change 29 後 API 一律需認證）。 */
export function sessionCookie(driverId: string): string {
  const token = signSession({ driverId }, getAuthSecret(), 3600_000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

/** 測試用：帶 session cookie 的 headers 物件（可合併其他 headers）。 */
export function authHeaders(driverId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: sessionCookie(driverId), ...extra };
}

/**
 * 測試用：確保 driver 列存在（資安稽核 2026-11 後，session 驗證會比對 DB 的 sessionVersion，
 * driver 不存在的 cookie 一律視為未登入）。
 */
export async function ensureDrivers(...driverIds: string[]): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    for (const id of driverIds) {
      await prisma.driver.upsert({
        where: { id },
        update: {},
        create: { id, username: `test-${id}`, passwordHash: 'x', passwordSalt: 'x' },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
