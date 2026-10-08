'use client';

import { useT } from '@/app/_components/locale-provider';
import type { PasswordRuleCode } from '@/domain/auth/password-policy';

/**
 * Change 42: 密碼規則說明。註冊與重設密碼共用。
 * 伺服器回傳 failedRules 時，對應項目標紅，讓使用者知道是哪一條沒過。
 */
export function PasswordRules({ failed }: { failed?: readonly PasswordRuleCode[] }) {
  const t = useT();
  const items: Array<{ code: PasswordRuleCode | 'DIGIT'; label: string }> = [
    { code: 'MIN_LENGTH', label: t('password.ruleMinLength') },
    { code: 'LOWERCASE', label: t('password.ruleLowercase') },
    { code: 'UPPERCASE', label: t('password.ruleUppercase') },
    { code: 'SPECIAL', label: t('password.ruleSpecial') },
    { code: 'COMMON', label: t('password.ruleCommon') },
    { code: 'DIGIT', label: t('password.ruleDigitOptional') },
  ];

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
        {t('password.rulesTitle')}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isFailed = failed?.includes(item.code as PasswordRuleCode) ?? false;
          return (
            <li
              key={item.code}
              data-testid={`pw-rule-${item.code}`}
              className={`flex items-start gap-1.5 text-xs ${
                isFailed
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <span aria-hidden="true">{isFailed ? '✕' : '•'}</span>
              <span>{item.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
