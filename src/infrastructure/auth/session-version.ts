import { PrismaClient } from '@prisma/client';

/**
 * 資安稽核 2026-11：session 撤銷。
 * 無狀態 cookie 帶簽發當下的 Driver.sessionVersion；驗證時比對 DB 目前值。
 * 登出、重設密碼時遞增 → 之前簽發的所有 cookie 失效。
 */
const globalForSession = globalThis as unknown as { __sessionVersionPrisma?: PrismaClient };

function prisma(): PrismaClient {
  globalForSession.__sessionVersionPrisma ??= new PrismaClient();
  return globalForSession.__sessionVersionPrisma;
}

/** driver 目前的 sessionVersion；driver 不存在 → null。 */
export async function currentSessionVersion(driverId: string): Promise<number | null> {
  const row = await prisma().driver.findUnique({ where: { id: driverId }, select: { sessionVersion: true } });
  return row ? row.sessionVersion : null;
}

/** 撤銷該 driver 目前所有 session。 */
export async function revokeSessions(driverId: string): Promise<void> {
  await prisma().driver.updateMany({ where: { id: driverId }, data: { sessionVersion: { increment: 1 } } });
}
