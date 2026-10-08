import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RECOMMENDED_LENGTH,
  PASSWORD_RULE_CODES,
} from '@/domain/auth/password-policy';

/**
 * Change 42: 密碼強度政策（純 domain）。
 * 規則：≥8 字元、至少各 1 個小寫 / 大寫 / 特殊符號；數字選填。
 * 另依 NIST SP 800-63B 建議擋常見弱密碼。
 */
describe('Change 42: password policy', () => {
  it('exposes the documented thresholds', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_RECOMMENDED_LENGTH).toBe(12);
    expect(PASSWORD_RULE_CODES).toEqual(['MIN_LENGTH', 'LOWERCASE', 'UPPERCASE', 'SPECIAL', 'COMMON']);
  });

  it.each([
    ['Secure#Pass8', '11 字元，含大小寫、特殊符號與數字'],
    ['Coffee@Sky', '10 字元，含大小寫與特殊符號（無數字也通過）'],
    ['aB!defgh', '剛好 8 字元的最小合規組合'],
  ])('accepts %s (%s)', (password) => {
    const result = validatePassword(password);
    expect(result.valid).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it('rejects password123 for missing uppercase and special char', () => {
    const result = validatePassword('password123');
    expect(result.valid).toBe(false);
    expect(result.failed).toContain('UPPERCASE');
    expect(result.failed).toContain('SPECIAL');
    expect(result.failed).not.toContain('MIN_LENGTH');
  });

  it('rejects Abc!1 for insufficient length', () => {
    const result = validatePassword('Abc!1');
    expect(result.valid).toBe(false);
    expect(result.failed).toContain('MIN_LENGTH');
  });

  it('reports every failed rule at once for an empty password', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.failed).toEqual(
      expect.arrayContaining(['MIN_LENGTH', 'LOWERCASE', 'UPPERCASE', 'SPECIAL']),
    );
  });

  it('rejects missing lowercase', () => {
    expect(validatePassword('ABCD!1234').failed).toContain('LOWERCASE');
  });

  // NIST SP 800-63B：字典攻擊防護——即使字元組成合規也要擋常見弱密碼
  it.each(['Password!1', 'Admin@123', 'Passw0rd!'])(
    'rejects the common weak password %s even though it matches the character rules',
    (password) => {
      const result = validatePassword(password);
      expect(result.valid).toBe(false);
      expect(result.failed).toContain('COMMON');
    },
  );

  it('matches common passwords case-insensitively', () => {
    expect(validatePassword('pAsSwOrD!1').failed).toContain('COMMON');
  });

  it('treats a non-string input as fully invalid instead of throwing', () => {
    const result = validatePassword(undefined as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.failed).toContain('MIN_LENGTH');
  });
});
