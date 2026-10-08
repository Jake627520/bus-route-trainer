import { DriverAccountRepository } from '@/application/auth/driver-account-repository.port';
import { Clock } from '@/application/common/clock';

export class InvalidResetTokenError extends Error {
  constructor(message = 'Reset link is invalid or has expired.') {
    super(message);
    this.name = 'InvalidResetTokenError';
  }
}

export interface ResetPasswordCommand {
  tokenHash: string;
  newPasswordHash: string;
  newPasswordSalt: string;
}

/**
 * Change 41: 以 token 重設密碼。token 需存在、未過期、未使用過；成功後更新密碼並作廢 token。
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly repo: DriverAccountRepository,
    private readonly clock: Clock
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const record = await this.repo.findResetToken(command.tokenHash);
    if (!record || record.usedAt !== null || record.expiresAt.getTime() < this.clock.now().getTime()) {
      throw new InvalidResetTokenError();
    }
    await this.repo.updatePassword(record.driverId, command.newPasswordHash, command.newPasswordSalt);
    await this.repo.markResetTokenUsed(record.id);
  }
}
