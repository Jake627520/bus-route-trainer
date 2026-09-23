import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Home from '@/app/page';

/**
 * Change 11 Task 10: 首頁整合——「待複習」區塊在路線列表之上。
 * mock fetch 依 URL 路由回應，兩個 client 區塊都掛在同一頁。
 */
describe('Change 11: Home page integrates review dashboard above route list', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  beforeEach(() => {
    mockFetch = vi.fn((url: string) => {
      if (String(url).includes('/api/review/summary')) return Promise.resolve(jsonRes({ data: [] }));
      if (String(url).includes('/api/routes')) return Promise.resolve(jsonRes({ data: [] }));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders a 待複習 section and the route list section', async () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: /待複習/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /所有路線/ })).toBeInTheDocument();

    // 兩個區塊的資料都被抓取
    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/review/summary'))).toBe(true);
    expect(urls.some((u) => u.includes('/api/routes'))).toBe(true);
  });
});
