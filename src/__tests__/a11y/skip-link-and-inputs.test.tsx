import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TextInput } from '@/components/ui';
import { SkipLink } from '@/app/_components/skip-link';
import { LanguageSwitcher } from '@/app/_components/language-switcher';
import { LocaleProvider } from '@/app/_components/locale-provider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('Change 48: TextInput ids', () => {
  it('gives two inputs with the same label different ids, each labelled correctly', () => {
    render(
      <>
        <TextInput label="Name" />
        <TextInput label="Name" />
      </>,
    );
    const inputs = screen.getAllByLabelText('Name');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });
  it('still honours an explicit id', () => {
    render(<TextInput label="Name" id="custom" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'custom');
  });
});

describe('Change 48: SkipLink', () => {
  it('points at #main-content in English', () => {
    render(<LocaleProvider locale="en"><SkipLink /></LocaleProvider>);
    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveAttribute('href', '#main-content');
  });
  it('is translated in zh-TW', () => {
    render(<LocaleProvider locale="zh-TW"><SkipLink /></LocaleProvider>);
    expect(screen.getByRole('link', { name: '跳到主要內容' })).toBeInTheDocument();
  });
  it('every page has a <main id="main-content"> target', () => {
    const pages = [
      'src/app/page.tsx',
      'src/app/login/page.tsx',
      'src/app/forgot/page.tsx',
      'src/app/reset/page.tsx',
      'src/app/practice/recall/page.tsx',
      'src/app/routes/[routeId]/page.tsx',
    ];
    for (const p of pages) {
      const src = fs.readFileSync(path.join(process.cwd(), p), 'utf8');
      expect(src, p).toMatch(/<main[^>]*id="main-content"/);
    }
  });
});

describe('Change 48: LanguageSwitcher lang attributes', () => {
  it('marks each language name with its own lang', () => {
    render(<LocaleProvider locale="en"><LanguageSwitcher /></LocaleProvider>);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: '繁體中文' })).toHaveAttribute('lang', 'zh-TW');
  });
});
