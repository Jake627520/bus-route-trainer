import { PrismaClient } from '@prisma/client';
import {
  DriverAccountRepository,
  DriverAccount,
  CreateDriverAccountInput,
} from '@/application/auth/driver-account-repository.port';

/**
 * Change 25: Prisma 實作司機帳號儲存。
 */
export class PrismaDriverAccountRepository implements DriverAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUsername(username: string): Promise<DriverAccount | null> {
    const row = await this.prisma.driver.findUnique({ where: { username } });
    return row
      ? { id: row.id, username: row.username, passwordHash: row.passwordHash, passwordSalt: row.passwordSalt }
      : null;
  }

  async create(input: CreateDriverAccountInput): Promise<DriverAccount> {
    const row = await this.prisma.driver.create({
      data: {
        username: input.username,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
      },
    });
    return { id: row.id, username: row.username, passwordHash: row.passwordHash, passwordSalt: row.passwordSalt };
  }
}
