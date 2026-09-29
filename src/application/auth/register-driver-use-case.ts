import { DriverAccountRepository } from '@/application/auth/driver-account-repository.port';

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username '${username}' is already taken`);
    this.name = 'UsernameTakenError';
  }
}

export interface RegisterDriverCommand {
  username: string;
  password: string;
}

export type HashFn = (password: string) => Promise<{ hash: string; salt: string }>;

/**
 * Change 25: 註冊司機帳號。username 重複 → UsernameTakenError。
 */
export class RegisterDriverUseCase {
  constructor(
    private readonly repo: DriverAccountRepository,
    private readonly hash: HashFn
  ) {}

  async execute(command: RegisterDriverCommand): Promise<{ id: string; username: string }> {
    const existing = await this.repo.findByUsername(command.username);
    if (existing) throw new UsernameTakenError(command.username);
    const { hash, salt } = await this.hash(command.password);
    const acc = await this.repo.create({
      username: command.username,
      passwordHash: hash,
      passwordSalt: salt,
    });
    return { id: acc.id, username: acc.username };
  }
}
