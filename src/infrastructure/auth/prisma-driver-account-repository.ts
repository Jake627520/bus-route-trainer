import { PrismaClient } from '@prisma/client';
import {
  DriverAccountRepository,
  DriverAccount,
  CreateDriverAccountInput,
  ResetTokenRecord,
} from '@/application/auth/driver-account-repository.port';
import { isMissingSessionVersionColumn } from './missing-session-version-column';

/** Change 25 / 41: Prisma 實作司機帳號儲存 + 密碼重設 token。 */
type DriverRow = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  passwordSalt: string;
};

function toAccount(row: DriverRow): DriverAccount {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.passwordHash,
    passwordSalt: row.passwordSalt,
  };
}

/** Omit sessionVersion so a preview DB that has not been migrated can still log in. */
const accountSelect = {
  id: true,
  username: true,
  email: true,
  passwordHash: true,
  passwordSalt: true,
} as const;

function passwordUpdate(passwordHash: string, passwordSalt: string, bumpSessionVersion: boolean) {
  return {
    passwordHash,
    passwordSalt,
    ...(bumpSessionVersion ? { sessionVersion: { increment: 1 } } : {}),
  };
}

export class PrismaDriverAccountRepository implements DriverAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUsername(username: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { username }, select: accountSelect });
    return row ? toAccount(row) : null;
  }

  async findByEmail(email: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { email }, select: accountSelect });
    return row ? toAccount(row) : null;
  }

  async findById(id: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { id }, select: accountSelect });
    return row ? toAccount(row) : null;
  }

  async create(input: CreateDriverAccountInput): Promise<DriverAccount> {
    const row = await this.prisma.driver.create({
      data: {
        username: input.username,
        email: input.email ?? null,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
      },
      select: accountSelect,
    });
    return toAccount(row);
  }

  async updatePassword(driverId: string, passwordHash: string, passwordSalt: string): Promise<void> {
    try {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: passwordUpdate(passwordHash, passwordSalt, true),
        select: { id: true },
      });
    } catch (error) {
      if (!isMissingSessionVersionColumn(error)) throw error;
      await this.prisma.driver.update({
        where: { id: driverId },
        data: passwordUpdate(passwordHash, passwordSalt, false),
        select: { id: true },
      });
    }
  }

  async createResetToken(driverId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.passwordResetToken.create({ data: { driverId, tokenHash, expiresAt } });
  }

  async findResetToken(tokenHash: string): Promise<ResetTokenRecord | null> {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    return row
      ? { id: row.id, driverId: row.driverId, tokenHash: row.tokenHash, expiresAt: row.expiresAt, usedAt: row.usedAt }
      : null;
  }

  async consumeResetTokenAndUpdatePassword(input: {
    tokenHash: string;
    now: Date;
    passwordHash: string;
    passwordSalt: string;
  }): Promise<boolean> {
    try {
      return await this.consumeResetToken(input, true);
    } catch (error) {
      if (!isMissingSessionVersionColumn(error)) throw error;
      return this.consumeResetToken(input, false);
    }
  }

  private consumeResetToken(
    input: {
      tokenHash: string;
      now: Date;
      passwordHash: string;
      passwordSalt: string;
    },
    bumpSessionVersion: boolean,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // 條件更新：只有一個請求能把 usedAt 從 null 改掉（避免併發重複使用）。
      const claimed = await tx.passwordResetToken.updateMany({
        where: { tokenHash: input.tokenHash, usedAt: null, expiresAt: { gte: input.now } },
        data: { usedAt: input.now },
      });
      if (claimed.count !== 1) return false;

      const token = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: input.tokenHash } });
      await tx.driver.update({
        where: { id: token.driverId },
        data: passwordUpdate(input.passwordHash, input.passwordSalt, bumpSessionVersion),
        select: { id: true },
      });
      // 作廢同一 driver 其他還沒用的 token（舊信裡的連結不能再用）。
      await tx.passwordResetToken.updateMany({
        where: { driverId: token.driverId, usedAt: null },
        data: { usedAt: input.now },
      });
      return true;
    });
  }
}
