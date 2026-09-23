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
      if (String(url).includes('/api/review/mastery-trend')) return Promise.resolve(jsonRes({ data: [] }));
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

  it('Change 16: renders the review reminder banner above the 待複習 dashboard', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/review/mastery-trend')) return Promise.resolve(jsonRes({ data: [] }));
      if (String(url).includes('/api/review/summary')) {
        return Promise.resolve(jsonRes({
          data: [{ routeId: 'R1', variantKey: 'V1', directionId: 0, status: 'IN_PROGRESS', headsign: null, dueCount: 2, newCount: 0, masteredCount: 0, totalCards: 5, nextReviewAt: null }],
        }));
      }
      if (String(url).includes('/api/routes')) return Promise.resolve(jsonRes({ data: [] }));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    render(<Home />);

    const banner = await screen.findByText(/你有\s*2\s*張卡片待複習/);
    const heading = screen.getByRole('heading', { name: /待複習/ });
    // 提醒橫幅在儀表板標題之上
    expect(banner.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Change 18: renders the 練習全部到期 batch button when variants are due', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (String(url).includes('/api/review/mastery-trend')) return Promise.resolve(jsonRes({ data: [] }));
      if (String(url).includes('/api/review/summary')) {
        return Promise.resolve(jsonRes({
          data: [{ routeId: 'R1', variantKey: 'V1', directionId: 0, status: 'IN_PROGRESS', headsign: null, dueCount: 2, newCount: 0, masteredCount: 0, totalCards: 5, nextReviewAt: null }],
        }));
      }
      if (String(url).includes('/api/routes')) return Promise.resolve(jsonRes({ data: [] }));
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    render(<Home />);

    const link = await screen.findByRole('link', { name: /練習全部到期/ });
    expect(link.getAttribute('href') ?? '').toContain('/practice/recall?queue=');
  });

  it('Change 17: renders a 精熟度趨勢 section below the 待複習 dashboard', async () => {
    render(<Home />);

    const trendHeading = await screen.findByRole('heading', { name: /精熟度趨勢/ });
    const reviewHeading = screen.getByRole('heading', { name: /待複習/ });
    // 趨勢 section 在待複習儀表板之下
    expect(reviewHeading.compareDocumentPosition(trendHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const urls = mockFetch.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/review/mastery-trend'))).toBe(true);
  });
});
