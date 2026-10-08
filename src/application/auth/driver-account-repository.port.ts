/**
 * Change 25 / 41: 司機帳號儲存（認證 + 密碼重設）。
 */
export interface DriverAccount {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  passwordSalt: string;
}

export interface CreateDriverAccountInput {
  username: string;
  email?: string | null;
  passwordHash: string;
  passwordSalt: string;
}

export interface ResetTokenRecord {
  id: string;
  driverId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface DriverAccountRepository {
  findByUsername(username: string): Promise<DriverAccount | null>;
  findByEmail(email: string): Promise<DriverAccount | null>;
  findById(id: string): Promise<DriverAccount | null>;
  create(input: CreateDriverAccountInput): Promise<DriverAccount>;
  updatePassword(driverId: string, passwordHash: string, passwordSalt: string): Promise<void>;

  // Change 41: 密碼重設 token。
  createResetToken(driverId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findResetToken(tokenHash: string): Promise<ResetTokenRecord | null>;
  markResetTokenUsed(id: string): Promise<void>;
}
