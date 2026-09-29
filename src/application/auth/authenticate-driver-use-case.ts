import { DriverAccountRepository } from '@/application/auth/driver-account-repository.port';

export interface AuthenticateDriverCommand {
  username: string;
  password: string;
}

export type VerifyFn = (password: string, hash: string, salt: string) => Promise<boolean>;

/**
 * Change 25: 驗證司機帳號密碼。成功回 { id, username }，否則 null（帳號不存在或密碼錯）。
 */
export class AuthenticateDriverUseCase {
  constructor(
    private readonly repo: DriverAccountRepository,
    private readonly verify: VerifyFn
  ) {}

  async execute(command: AuthenticateDriverCommand): Promise<{ id: string; username: string } | null> {
    const account = await this.repo.findByUsername(command.username);
    if (!account) return null;
    const ok = await this.verify(command.password, account.passwordHash, account.passwordSalt);
    return ok ? { id: account.id, username: account.username } : null;
  }
}
