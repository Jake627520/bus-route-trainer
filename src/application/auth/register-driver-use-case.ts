import { DriverAccountRepository } from '@/application/auth/driver-account-repository.port';

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username '${username}' is already taken`);
    this.name = 'UsernameTakenError';
  }
}

export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`Email '${email}' is already registered`);
    this.name = 'EmailTakenError';
  }
}

export interface RegisterDriverCommand {
  username: string;
  password: string;
  /** Change 41: 選填 email（供密碼重設用）。 */
  email?: string | null;
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

    const email = command.email ? command.email.trim().toLowerCase() : null;
    if (email) {
      const emailOwner = await this.repo.findByEmail(email);
      if (emailOwner) throw new EmailTakenError(email);
    }

    const { hash, salt } = await this.hash(command.password);
    const acc = await this.repo.create({
      username: command.username,
      email,
      passwordHash: hash,
      passwordSalt: salt,
    });
    return { id: acc.id, username: acc.username };
  }
}
