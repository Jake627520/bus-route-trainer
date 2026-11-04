import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/infrastructure/db/prisma';
import { isMissingSessionVersionColumn } from './missing-session-version-column';

/**
 * 資安稽核 2026-11：session 撤銷。
 * 無狀態 cookie 帶簽發當下的 Driver.sessionVersion；驗證時比對 DB 目前值。
 * 登出、重設密碼時遞增 → 之前簽發的所有 cookie 失效。
 *
 * Preview 若還沒有 session_version 欄位（未對該 DB migrate），讀取視為 0、
 * 撤銷變成 no-op，避免每個請求都 500。driver 不存在仍回 null。
 */

/** driver 目前的 sessionVersion；driver 不存在 → null。 */
export async function currentSessionVersion(driverId: string, db: PrismaClient = prisma): Promise<number | null> {
  try {
    const row = await db.driver.findUnique({ where: { id: driverId }, select: { sessionVersion: true } });
    return row ? row.sessionVersion : null;
  } catch (error) {
    if (!isMissingSessionVersionColumn(error)) throw error;
    const row = await db.driver.findUnique({ where: { id: driverId }, select: { id: true } });
    return row ? 0 : null;
  }
}

/** 撤銷該 driver 目前所有 session。欄位尚未建立時不丟錯（cookie 仍會被清掉）。 */
export async function revokeSessions(driverId: string, db: PrismaClient = prisma): Promise<void> {
  try {
    await db.driver.updateMany({ where: { id: driverId }, data: { sessionVersion: { increment: 1 } } });
  } catch (error) {
    if (!isMissingSessionVersionColumn(error)) throw error;
  }
}
