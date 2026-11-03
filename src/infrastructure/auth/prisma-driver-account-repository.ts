import { PrismaClient } from '@prisma/client';
import {
  DriverAccountRepository,
  DriverAccount,
  CreateDriverAccountInput,
  ResetTokenRecord,
} from '@/application/auth/driver-account-repository.port';

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

export class PrismaDriverAccountRepository implements DriverAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUsername(username: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { username } });
    return row ? toAccount(row) : null;
  }

  async findByEmail(email: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { email } });
    return row ? toAccount(row) : null;
  }

  async findById(id: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { id } });
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
    });
    return toAccount(row);
  }

  async updatePassword(driverId: string, passwordHash: string, passwordSalt: string): Promise<void> {
    await this.prisma.driver.update({ where: { id: driverId }, data: { passwordHash, passwordSalt, sessionVersion: { increment: 1 } } });
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
        data: {
          passwordHash: input.passwordHash,
          passwordSalt: input.passwordSalt,
          sessionVersion: { increment: 1 },
        },
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
