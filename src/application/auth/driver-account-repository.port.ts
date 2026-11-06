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

  /**
   * 原子操作：消耗一個「未用、未過期」的 token，更新該 driver 的密碼，
   * 並作廢同一 driver 其他未用 token。token 無效或已被併發請求用掉 → false。
   */
  consumeResetTokenAndUpdatePassword(input: {
    tokenHash: string;
    now: Date;
    passwordHash: string;
    passwordSalt: string;
  }): Promise<boolean>;
}
