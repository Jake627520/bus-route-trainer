/**
 * Change 25: 司機帳號儲存（認證用）。
 */
export interface DriverAccount {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface CreateDriverAccountInput {
  username: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface DriverAccountRepository {
  findByUsername(username: string): Promise<DriverAccount | null>;
  findById(id: string): Promise<DriverAccount | null>;
  create(input: CreateDriverAccountInput): Promise<DriverAccount>;
}
