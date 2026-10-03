import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider } from '@/app/_components/locale-provider';
import { LanguageSwitcher } from '@/app/_components/language-switcher';

/**
 * Change 30 Task 4: LanguageSwitcher（寫 cookie + router.refresh）。
 */
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('Change 30: LanguageSwitcher', () => {
  beforeEach(() => {
    refresh.mockClear();
    // 清掉 cookie
    document.cookie = 'brt_locale=; Max-Age=0; Path=/';
  });

  it('marks the current locale as pressed', () => {
    render(
      <LocaleProvider locale="en">
        <LanguageSwitcher />
      </LocaleProvider>
    );
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /繁體中文/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switching writes the cookie and refreshes', () => {
    render(
      <LocaleProvider locale="en">
        <LanguageSwitcher />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /繁體中文/ }));
    expect(document.cookie).toContain('brt_locale=zh-TW');
    expect(refresh).toHaveBeenCalled();
  });
});
