import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LocaleProvider } from '@/app/_components/locale-provider';
import { OfflineBanner } from '@/app/_components/offline-banner';

const setOnline = (value: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
const fire = (type: 'online' | 'offline') => act(() => { window.dispatchEvent(new Event(type)); });

describe('Change 51: OfflineBanner', () => {
  afterEach(() => setOnline(true));

  it('shows nothing while online, but keeps its live region mounted (so changes get announced)', () => {
    setOnline(true);
    render(<LocaleProvider locale="en"><OfflineBanner /></LocaleProvider>);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
  });

  it('says it is offline (English)', () => {
    setOnline(false);
    render(<LocaleProvider locale="en"><OfflineBanner /></LocaleProvider>);
    expect(screen.getByRole('status')).toHaveTextContent("You're offline");
  });

  it('says it is offline (繁體中文)', () => {
    setOnline(false);
    render(<LocaleProvider locale="zh-TW"><OfflineBanner /></LocaleProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('目前離線');
  });

  it('appears when the connection drops and disappears when it returns — in the same live region', () => {
    setOnline(true);
    render(<LocaleProvider locale="en"><OfflineBanner /></LocaleProvider>);
    const region = screen.getByRole('status');
    setOnline(false);
    fire('offline');
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent("You're offline");
    setOnline(true);
    fire('online');
    expect(region).toBeEmptyDOMElement();
  });
});
