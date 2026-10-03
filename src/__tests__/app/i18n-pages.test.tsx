import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider } from '@/i18n/locale-provider';
import LoginPage from '@/app/login/page';
import Home from '@/app/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe('Change 30: pages render in English', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network'))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('login page', () => {
    render(<LocaleProvider locale="en"><LoginPage /></LocaleProvider>);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('home page headings', () => {
    render(<LocaleProvider locale="en"><Home /></LocaleProvider>);
    expect(screen.getByRole('heading', { name: 'Route Memory Trainer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Due for review' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mastery trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All routes' })).toBeInTheDocument();
  });
});
