import { createHash, randomBytes } from 'node:crypto';

/** Change 41: 密碼重設 token。寄明碼給使用者、DB 只存 sha256 雜湊（比對用）。 */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
