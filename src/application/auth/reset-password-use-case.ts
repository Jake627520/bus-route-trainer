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
 * 資安稽核 2026-11：消耗 token、改密碼、作廢其他 token 在同一個 transaction 內完成。
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly repo: DriverAccountRepository,
    private readonly clock: Clock
  ) {}

  async execute(command: ResetPasswordCommand): Promise<void> {
    const ok = await this.repo.consumeResetTokenAndUpdatePassword({
      tokenHash: command.tokenHash,
      now: this.clock.now(),
      passwordHash: command.newPasswordHash,
      passwordSalt: command.newPasswordSalt,
    });
    if (!ok) throw new InvalidResetTokenError();
  }
}
