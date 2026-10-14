import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ServiceWorkerRegister } from '@/app/_components/service-worker-register';

describe('Change 51: ServiceWorkerRegister', () => {
  const register = vi.fn();
  beforeEach(() => {
    register.mockReset();
    register.mockResolvedValue({});
    Object.defineProperty(window.navigator, 'serviceWorker', { value: { register }, configurable: true });
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    // @ts-expect-error 清掉測試用的 stub
    delete window.navigator.serviceWorker;
  });

  it('registers /sw.js at scope "/" in production, bypassing the HTTP cache for updates', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<ServiceWorkerRegister />);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('does nothing outside production (so dev and tests are never affected by a stale worker)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<ServiceWorkerRegister />);
    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing where service workers are unsupported', () => {
    vi.stubEnv('NODE_ENV', 'production');
    // @ts-expect-error 模擬不支援的瀏覽器
    delete window.navigator.serviceWorker;
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });

  it('swallows registration failures silently', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    register.mockRejectedValue(new Error('SecurityError'));
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    await Promise.resolve();
  });

  it('waits for the page "load" event so it never competes with the first paint', () => {
    vi.stubEnv('NODE_ENV', 'production');
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    render(<ServiceWorkerRegister />);
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('renders nothing', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { container } = render(<ServiceWorkerRegister />);
    expect(container).toBeEmptyDOMElement();
  });
});
